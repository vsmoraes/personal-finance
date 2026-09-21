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
import { importService } from "./imports.js";
import type {
  FinanceStore,
  ImportAdapter,
  ResourceMap,
  Runtime,
} from "./ports.js";
import { service } from "./service.js";

/** Driving port for the product. No HTTP, SQL, filesystem, or wall-clock dependencies. */
export class FinanceApplication {
  private readonly service;
  readonly imports;
  constructor(
    private readonly store: FinanceStore,
    private readonly runtime: Runtime,
    adapter: ImportAdapter,
  ) {
    this.service = service(store, runtime);
    this.imports = importService(store, this.service, runtime, adapter);
  }
  list<K extends keyof ResourceMap>(resource: K): ResourceMap[K][] {
    return this.store.repositories[resource].list();
  }
  get<K extends keyof ResourceMap>(resource: K, id: string): ResourceMap[K] {
    const value = this.store.repositories[resource].get(id);
    assert(value, "NOT_FOUND", 404);
    return value;
  }
  save<K extends keyof ResourceMap>(
    resource: K,
    input: ResourceMap[K],
    id?: string,
  ): ResourceMap[K] {
    return this.store.atomic(() => {
      const previous = id ? this.get(resource, id) : undefined;
      if (previous) assert(input.version === previous.version, "CONFLICT", 409);
      input.id = id ?? this.runtime.id();
      input.version = (previous?.version ?? 0) + 1;
      switch (input.$typeName) {
        case "finance.v1.Category":
          this.service.validateCategory(
            input,
            previous?.$typeName === "finance.v1.Category"
              ? previous
              : undefined,
          );
          break;
        case "finance.v1.Budget":
          this.service.validateBudget(input);
          break;
        case "finance.v1.RecurringCommitment":
          this.service.validateCommitment(input);
          break;
        case "finance.v1.CategorizationRule":
          this.service.validateRule(input);
          break;
        case "finance.v1.Scenario":
          this.service.validateScenario(input);
          break;
        default:
          throw new DomainError("INVALID_RESOURCE");
      }
      this.store.repositories[resource].save(input, previous?.version);
      this.store.audit(resource, previous ? "update" : "create", input.id);
      return input;
    });
  }
  remove<K extends keyof ResourceMap>(
    resource: K,
    id: string,
    version: number,
  ): void {
    this.store.atomic(() => {
      const value = this.get(resource, id);
      assert(value.version === version, "CONFLICT", 409);
      if (value.$typeName === "finance.v1.Category") {
        value.archived = true;
        value.version++;
        this.store.repositories.categories.save(value, version);
      } else this.store.repositories[resource].remove(id, version);
      this.store.audit(resource, "delete", id);
    });
  }
  settings(): p.Settings {
    return this.store.settings();
  }
  updateSettings(s: p.Settings): p.Settings {
    return this.store.atomic(() => {
      const old = this.store.settings();
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
      this.store.saveSettings(s, old.version);
      this.store.audit("settings", "update", "application");
      return s;
    });
  }
  transactions(filter: p.ListRequest): p.FinanceResponse {
    const rows = this.service.filterTransactions(filter);
    const page = filter.page || 1;
    const pageSize = filter.pageSize || 25;
    return create(p.FinanceResponseSchema, {
      transactions: rows.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: rows.length },
    });
  }
  createTransaction(input: p.Transaction, key: string): p.Transaction {
    assert(key.length >= 8 && key.length <= 200, "IDEMPOTENCY_REQUIRED");
    const hash = this.runtime.hash(toJsonString(p.TransactionSchema, input));
    return this.store.atomic(() => {
      const cached = this.store.getIdempotency(`transaction:${key}`);
      if (cached) {
        assert(cached.hash === hash, "IDEMPOTENCY_CONFLICT", 409);
        return fromJsonString(p.TransactionSchema, cached.payload);
      }
      const transaction = this.service.normalizeTransaction(input);
      this.service.saveTransaction(transaction);
      this.store.saveIdempotency(
        `transaction:${key}`,
        hash,
        toJsonString(p.TransactionSchema, transaction),
      );
      return transaction;
    });
  }
  updateTransaction(id: string, input: p.Transaction): p.Transaction {
    return this.store.atomic(() => {
      const previous = this.get("transactions", id);
      assert(input.version === previous.version, "CONFLICT", 409);
      const transaction = this.service.normalizeTransaction(input, previous);
      this.service.saveTransaction(transaction, previous);
      return transaction;
    });
  }
  recategorize(input: p.BulkRequest): void {
    this.store.atomic(() => {
      assert(
        input.transactionIds.length > 0 && input.transactionIds.length <= 1000,
      );
      for (const id of input.transactionIds) {
        const old = this.get("transactions", id);
        this.service.category(input.categoryId, old.type);
        this.service.saveTransaction(
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
  previewRules(input: p.BulkRequest): p.RulePreviewResponse {
    return this.store.atomic(() => {
      const matches: p.RuleMatch[] = [];
      const transactions = input.transactionIds.length
        ? input.transactionIds.map((id) => this.get("transactions", id))
        : this.list("transactions");
      for (const old of transactions) {
        const result = applyRules(
          old,
          this.list("rules"),
          input.overwriteManual,
        );
        matches.push(...result.matches);
        if (input.apply && result.matches.length) {
          this.service.category(
            result.transaction.categoryId,
            result.transaction.type,
          );
          result.transaction.version++;
          result.transaction.updatedAt = this.runtime.now();
          this.service.saveTransaction(result.transaction, old);
        }
      }
      return create(p.RulePreviewResponseSchema, { matches });
    });
  }
  putBudget(year: string, month: string, input: p.Budget): p.Budget {
    return this.store.atomic(() => {
      input.startMonth = `${year}-${month.padStart(2, "0")}`;
      input.endMonth = input.startMonth;
      this.service.validateBudget(input);
      const existing = this.list("budgets").find(
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
      this.store.repositories.budgets.save(input, old?.version);
      this.store.audit("budgets", "update", id);
      return input;
    });
  }
  copyBudgets(input: p.BudgetCopyRequest): void {
    this.store.atomic(() => {
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
      const data = this.service.reportData();
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
            const existing = this.list("budgets").find(
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
            this.store.repositories.budgets.save(copied, existing?.version);
            this.store.audit("budgets", "copy", id);
          }
        }
    });
  }
  report(
    kind: "dashboard" | "monthly" | "categories" | "forecast",
    request: p.ReportRequest,
  ): p.ReportResponse {
    const year = request.year || this.settings().reportYear;
    assert(
      year >= 1900 && year <= 9999 && request.month >= 0 && request.month <= 12,
    );
    const data = this.service.reportData(
      request.currencyCode || this.settings().defaultCurrency,
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
        ? this.get("scenarios", request.scenarioId)
        : undefined;
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: this.settings().timezone,
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
  export(): p.FinanceResponse {
    return create(p.FinanceResponseSchema, {
      transactions: this.list("transactions"),
      categories: this.list("categories"),
      settings: this.settings(),
      budgets: this.list("budgets"),
      commitments: this.list("commitments"),
      rules: this.list("rules"),
      scenarios: this.list("scenarios"),
    });
  }
}
