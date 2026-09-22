import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";

import * as p from "../../contracts/src/finance/v1/finance_pb.js";
import {
  applyRules,
  categoryReport,
  dateString,
  forecast,
  monthIndex,
  monthlyReport,
  totalRows,
} from "../../domain/src/finance.js";
import { assert, digits, DomainError } from "../../domain/src/money.js";
import type { FinanceUseCases, ReportKind } from "./finance-use-cases.js";
import { importService } from "./imports.js";
import type {
  FinanceStore,
  ImportAdapter,
  ResourceMap,
  Runtime,
} from "./ports.js";
import { ResourceUseCases } from "./resource-use-cases.js";
import { service } from "./service.js";

/** Driving port for the product. No HTTP, SQL, filesystem, or wall-clock dependencies. */
export class FinanceApplication implements FinanceUseCases {
  private readonly service;
  private readonly resources;
  readonly imports;
  constructor(
    private readonly store: FinanceStore,
    private readonly runtime: Runtime,
    adapter: ImportAdapter,
  ) {
    this.service = service(store, runtime);
    this.resources = new ResourceUseCases(store, runtime, this.service);
    this.imports = importService(store, this.service, runtime, adapter);
  }
  async list<K extends keyof ResourceMap>(
    resource: K,
  ): Promise<ResourceMap[K][]> {
    return this.resources.list(resource);
  }
  async get<K extends keyof ResourceMap>(
    resource: K,
    id: string,
  ): Promise<ResourceMap[K]> {
    return this.resources.get(resource, id);
  }
  save<K extends keyof ResourceMap>(
    resource: K,
    input: ResourceMap[K],
    id?: string,
  ): Promise<ResourceMap[K]> {
    return this.resources.save(resource, input, id);
  }
  remove<K extends keyof ResourceMap>(
    resource: K,
    id: string,
    version: number,
  ): Promise<void> {
    return this.resources.remove(resource, id, version);
  }
  settings(): Promise<p.Settings> {
    return this.store.settings();
  }
  updateSettings(s: p.Settings): Promise<p.Settings> {
    return this.store.atomic(async () => {
      const old = await this.store.settings();
      assert(s.version === old.version, "CONFLICT", 409);
      assert(["en", "es", "pt-BR"].includes(s.language));
      digits(s.defaultCurrency);
      s.baseCurrency = "";
      digits(s.importCurrency);
      try {
        new Intl.DateTimeFormat("en", { timeZone: s.timezone }).format();
      } catch {
        throw new DomainError("INVALID_TIMEZONE");
      }
      assert(
        s.firstDayOfWeek >= 0 &&
          s.firstDayOfWeek <= 6 &&
          s.reportYear >= 1900 &&
          s.reportYear <= 9999,
      );
      assert(
        ["light", "dark", "custom", "purple", "system"].includes(s.theme) &&
          ["light", "dark"].includes(s.customMode || "light") &&
          ["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].includes(s.dateFormat) &&
          ["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"].includes(
            s.importDateFormat,
          ) &&
          [".", ","].includes(s.importDecimalSeparator),
      );
      s.version++;
      await this.store.saveSettings(s, old.version);
      await this.store.audit("settings", "update", "application");
      return s;
    });
  }
  async transactions(filter: p.ListRequest): Promise<p.FinanceResponse> {
    const rows = await this.service.filterTransactions(filter);
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 25;
    return create(p.FinanceResponseSchema, {
      transactions: rows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: rows.length },
    });
  }
  createTransaction(input: p.Transaction, key: string): Promise<p.Transaction> {
    assert(key.length >= 8 && key.length <= 200, "IDEMPOTENCY_REQUIRED");
    const hash = this.runtime.hash(toJsonString(p.TransactionSchema, input));
    return this.store.atomic(async () => {
      const cached = await this.store.getIdempotency(`transaction:${key}`);
      if (cached) {
        assert(cached.hash === hash, "IDEMPOTENCY_CONFLICT", 409);
        return fromJsonString(p.TransactionSchema, cached.payload);
      }
      const transaction = await this.service.normalizeTransaction(input);
      await this.service.saveTransaction(transaction);
      await this.store.saveIdempotency(
        `transaction:${key}`,
        hash,
        toJsonString(p.TransactionSchema, transaction),
      );
      return transaction;
    });
  }
  updateTransaction(id: string, input: p.Transaction): Promise<p.Transaction> {
    return this.store.atomic(async () => {
      const previous = await this.get("transactions", id);
      assert(input.version === previous.version, "CONFLICT", 409);
      const transaction = await this.service.normalizeTransaction(
        input,
        previous,
      );
      await this.service.saveTransaction(transaction, previous);
      return transaction;
    });
  }
  recategorize(input: p.BulkRequest): Promise<void> {
    return this.store.atomic(async () => {
      assert(
        input.transactionIds.length > 0 && input.transactionIds.length <= 1000,
      );
      for (const id of input.transactionIds) {
        const old = await this.get("transactions", id);
        await this.service.category(input.categoryId, old.type);
        await this.service.saveTransaction(
          {
            ...old,
            categoryId: input.categoryId,
            categorizationSource: p.CategorizationSource.MANUAL,
            ruleId: "",
            version: old.version + 1,
            updatedAt: this.runtime.now(),
          },
          old,
        );
      }
    });
  }
  previewRules(input: p.BulkRequest): Promise<p.RulePreviewResponse> {
    return this.store.atomic(async () => {
      const matches: p.RuleMatch[] = [];
      const transactions = input.transactionIds.length
        ? await Promise.all(
            input.transactionIds.map((id) => this.get("transactions", id)),
          )
        : await this.list("transactions");
      for (const old of transactions) {
        const result = applyRules(
          old,
          await this.list("rules"),
          input.overwriteManual,
        );
        matches.push(...result.matches);
        if (input.apply && result.matches.length) {
          await this.service.category(
            result.transaction.categoryId,
            result.transaction.type,
          );
          result.transaction.version++;
          result.transaction.updatedAt = this.runtime.now();
          await this.service.saveTransaction(result.transaction, old);
        }
      }
      return create(p.RulePreviewResponseSchema, { matches });
    });
  }
  putBudget(year: string, month: string, input: p.Budget): Promise<p.Budget> {
    return this.store.atomic(async () => {
      input.startMonth = `${year}-${month.padStart(2, "0")}`;
      input.endMonth = input.startMonth;
      await this.service.validateBudget(input);
      const existing = (await this.list("budgets")).find(
        (b) =>
          b.categoryId === input.categoryId &&
          b.startMonth === input.startMonth &&
          b.endMonth === input.endMonth &&
          b.amount?.currencyCode === input.amount?.currencyCode,
      );
      const id =
        existing?.id ??
        `${input.categoryId}:${input.amount?.currencyCode}:${input.startMonth}`;
      const old = existing;
      assert(!old || old.version === input.version, "CONFLICT", 409);
      input.id = id;
      input.version = (old?.version ?? 0) + 1;
      await this.store.repositories.budgets.save(input, old?.version);
      await this.store.audit("budgets", "update", id);
      return input;
    });
  }
  copyBudgets(input: p.BudgetCopyRequest): Promise<void> {
    return this.store.atomic(async () => {
      const pairs: [string, string][] = [];
      if (input.sourceYear) {
        assert(
          input.sourceYear >= 1900 &&
            input.targetYear >= 1900 &&
            input.sourceYear <= 9999 &&
            input.targetYear <= 9999,
        );
        for (let m = 1; m <= 12; m++)
          pairs.push([
            `${input.sourceYear}-${String(m).padStart(2, "0")}`,
            `${input.targetYear}-${String(m).padStart(2, "0")}`,
          ]);
      } else {
        monthIndex(input.sourceMonth);
        assert(
          input.targetMonths.length > 0 && input.targetMonths.length <= 120,
        );
        for (const target of input.targetMonths) {
          monthIndex(target);
          pairs.push([input.sourceMonth, target]);
        }
      }
      const data = await this.service.reportData();
      for (const [source, target] of pairs)
        for (const c of data.categories) {
          const currencies = new Set([
            ...data.budgets
              .filter((b) => b.categoryId === c.id)
              .map((b) => b.amount?.currencyCode),
            c.defaultBudget?.currencyCode,
          ]);
          for (const currency of currencies) {
            if (!currency || !c.budgetable) continue;
            const sourceBudget = data.budgets
              .filter(
                (b) =>
                  b.categoryId === c.id &&
                  b.amount?.currencyCode === currency &&
                  b.startMonth <= source &&
                  (!b.endMonth || b.endMonth >= source),
              )
              .sort(
                (a, b) =>
                  b.startMonth.localeCompare(a.startMonth) ||
                  a.id.localeCompare(b.id),
              )[0];
            const amount =
              sourceBudget?.amount ??
              (c.defaultBudget?.currencyCode === currency
                ? c.defaultBudget
                : undefined);
            if (!amount) continue;
            const existing = (await this.list("budgets")).find(
              (b) =>
                b.categoryId === c.id &&
                b.startMonth === target &&
                b.endMonth === target &&
                b.amount?.currencyCode === currency,
            );
            const id = existing?.id ?? `${c.id}:${currency}:${target}`;
            const copied = create(p.BudgetSchema, {
              id,
              categoryId: c.id,
              startMonth: target,
              endMonth: target,
              amount,
              version: (existing?.version ?? 0) + 1,
            });
            await this.store.repositories.budgets.save(
              copied,
              existing?.version,
            );
            await this.store.audit("budgets", "copy", id);
          }
        }
    });
  }
  async report(
    kind: ReportKind,
    request: p.ReportRequest,
  ): Promise<p.ReportResponse> {
    const settings = await this.settings();
    const year = request.year || settings.reportYear;
    assert(
      year >= 1900 && year <= 9999 && request.month >= 0 && request.month <= 12,
    );
    const data = await this.service.reportData(
      request.currencyCode || settings.defaultCurrency,
    );
    let rows = monthlyReport(data, year);
    let totals = totalRows(
      request.month
        ? rows.filter((row) => Number(row.key.slice(5)) === request.month)
        : rows,
    );
    if (kind === "categories") rows = categoryReport(data, year, request.month);
    if (kind === "forecast") {
      const scenario = request.scenarioId
        ? await this.get("scenarios", request.scenarioId)
        : undefined;
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: settings.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(this.runtime.now()));
      rows = forecast(data, year, request.asOfDate || today, scenario);
      totals = totalRows(rows);
    }
    return create(p.ReportResponseSchema, {
      rows,
      totals,
      currencyCode: data.currency,
      recentTransactions:
        kind === "dashboard"
          ? data.transactions
              .filter((t) => t.amount?.currencyCode === data.currency)
              .sort((a, b) =>
                dateString(b.date).localeCompare(dateString(a.date)),
              )
              .slice(0, 5)
          : [],
    });
  }
  async export(): Promise<p.FinanceResponse> {
    return create(p.FinanceResponseSchema, {
      transactions: await this.list("transactions"),
      categories: await this.list("categories"),
      settings: await this.settings(),
      budgets: await this.list("budgets"),
      commitments: await this.list("commitments"),
      rules: await this.list("rules"),
      scenarios: await this.list("scenarios"),
    });
  }
}
