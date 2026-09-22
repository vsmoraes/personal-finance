import { create } from "@bufbuild/protobuf";

import * as p from "../../contracts/src/finance/v1/finance_pb.js";
import {
  applyRules,
  dateString,
  monthIndex,
  parseDate,
  type ReportData,
} from "../../domain/src/finance.js";
import { assert, digits } from "../../domain/src/money.js";
import type { FinanceStore, Runtime } from "./ports.js";

export function service(store: FinanceStore, runtime: Runtime) {
  const allCategories = async () =>
    (await store.repositories.categories.list()).sort(
      (a, b) => a.position - b.position || a.id.localeCompare(b.id),
    );
  const allRules = () => store.repositories.rules.list();
  const allTransactions = () => store.repositories.transactions.list();
  async function category(
    id: string,
    type?: p.TransactionType,
    allowArchived = false,
  ) {
    const c = (await allCategories()).find((value) => value.id === id);
    assert(c, "CATEGORY_NOT_FOUND", 404);
    assert(allowArchived || !c.archived, "CATEGORY_ARCHIVED");
    assert(type === undefined || c.type === type, "CATEGORY_TYPE_MISMATCH");
    return c;
  }
  function validateMoney(m: p.Money | undefined, positive = false) {
    assert(m, "INVALID_AMOUNT");
    digits(m.currencyCode);
    assert(m.minorUnits >= (positive ? 1n : 0n), "INVALID_AMOUNT");
  }
  async function normalizeTransaction(
    input: p.Transaction,
    previous?: p.Transaction,
    importing = false,
  ): Promise<p.Transaction> {
    dateString(input.date);
    assert(input.counterparty.length <= 250 && input.note.length <= 4000);
    assert(
      input.type === p.TransactionType.INCOME ||
        input.type === p.TransactionType.EXPENSE,
    );
    validateMoney(input.amount, true);
    assert(input.amount);
    await category(
      input.categoryId,
      input.type,
      previous?.categoryId === input.categoryId,
    );
    let t = create(p.TransactionSchema, {
      ...input,
      id: previous?.id ?? runtime.id(),
      exchangeRate: "",
      createdAt: previous?.createdAt ?? runtime.now(),
      updatedAt: runtime.now(),
      version: (previous?.version ?? 0) + 1,
      categorizationSource: importing
        ? p.CategorizationSource.IMPORT
        : previous?.categoryId === input.categoryId
          ? previous.categorizationSource
          : p.CategorizationSource.MANUAL,
      ruleId: previous?.categoryId === input.categoryId ? previous.ruleId : "",
      importSource:
        previous?.importSource ?? (importing ? input.importSource : ""),
      externalId: previous?.externalId ?? (importing ? input.externalId : ""),
    });
    delete t.baseAmount;
    if (importing) t = applyRules(t, await allRules()).transaction;
    await category(t.categoryId, t.type, previous?.categoryId === t.categoryId);
    return t;
  }
  async function transaction(id: string) {
    const row = await store.repositories.transactions.get(id);
    assert(row, "NOT_FOUND", 404);
    return row;
  }
  async function saveTransaction(
    t: p.Transaction,
    previous?: p.Transaction,
    dedup?: string,
  ) {
    await store.repositories.transactions.save(t, previous?.version, dedup);
    await store.audit("transaction", previous ? "update" : "create", t.id);
  }
  async function filterTransactions(filter: p.ListRequest) {
    assert(
      filter.page >= 0 && filter.pageSize >= 0 && filter.pageSize <= 100,
      "INVALID_PAGINATION",
    );
    if (filter.startDate) parseDate(filter.startDate);
    if (filter.endDate) parseDate(filter.endDate);
    assert(
      !filter.sort ||
        ["date", "amount", "counterparty", "createdAt"].includes(filter.sort),
      "INVALID_SORT",
    );
    const list = (await allTransactions()).filter(
      (t) =>
        (!filter.search ||
          `${t.counterparty} ${t.note}`
            .toLowerCase()
            .includes(filter.search.toLowerCase())) &&
        (!filter.startDate || dateString(t.date) >= filter.startDate) &&
        (!filter.endDate || dateString(t.date) <= filter.endDate) &&
        (!filter.type || t.type === filter.type) &&
        (!filter.categoryId || t.categoryId === filter.categoryId) &&
        (!filter.currencyCode ||
          t.amount?.currencyCode === filter.currencyCode) &&
        (!filter.counterparty ||
          t.counterparty
            .toLowerCase()
            .includes(filter.counterparty.toLowerCase())) &&
        (filter.minMinorUnits === undefined ||
          (t.amount?.minorUnits ?? 0n) >= filter.minMinorUnits) &&
        (filter.maxMinorUnits === undefined ||
          (t.amount?.minorUnits ?? 0n) <= filter.maxMinorUnits),
    );
    list.sort((a, b) => {
      let compared: number;
      if (filter.sort === "amount") {
        const aa = a.amount?.minorUnits ?? 0n,
          bb = b.amount?.minorUnits ?? 0n;
        compared =
          (a.amount?.currencyCode ?? "").localeCompare(
            b.amount?.currencyCode ?? "",
          ) || (aa < bb ? -1 : aa > bb ? 1 : 0);
      } else if (filter.sort === "counterparty")
        compared = a.counterparty.localeCompare(b.counterparty);
      else if (filter.sort === "createdAt")
        compared = a.createdAt.localeCompare(b.createdAt);
      else compared = dateString(a.date).localeCompare(dateString(b.date));
      return (
        (filter.descending ? -1 : 1) * (compared || a.id.localeCompare(b.id))
      );
    });
    return list;
  }
  async function reportData(currency?: string): Promise<ReportData> {
    const selected = currency ?? (await store.settings()).defaultCurrency;
    digits(selected);
    return {
      transactions: await allTransactions(),
      categories: await allCategories(),
      budgets: await store.repositories.budgets.list(),
      commitments: await store.repositories.commitments.list(),
      currency: selected,
    };
  }
  async function validateCategory(c: p.Category, previous?: p.Category) {
    assert(c.name.trim() || previous?.builtin, "NAME_REQUIRED");
    assert(
      c.name.length <= 100 &&
        /^#[0-9a-fA-F]{6}$/.test(c.color) &&
        c.icon.length <= 16,
    );
    assert(
      c.type === p.TransactionType.INCOME ||
        c.type === p.TransactionType.EXPENSE,
    );
    if (previous) {
      assert(
        c.type === previous.type ||
          !(await allTransactions()).some((t) => t.categoryId === c.id),
        "CATEGORY_IN_USE",
        409,
      );
      c.builtin = previous.builtin;
      c.slug = previous.slug;
    } else {
      c.builtin = false;
      c.slug = `custom-${runtime.id()}`;
    }
    if (c.defaultBudget) validateMoney(c.defaultBudget);
  }
  async function validateBudget(b: p.Budget) {
    const c = await category(b.categoryId);
    assert(c.budgetable, "NOT_BUDGETABLE");
    monthIndex(b.startMonth);
    if (b.endMonth) assert(monthIndex(b.endMonth) >= monthIndex(b.startMonth));
    validateMoney(b.amount);
  }
  async function validateCommitment(c: p.RecurringCommitment) {
    await category(c.categoryId);
    assert(c.description.trim() && c.description.length <= 250);
    monthIndex(c.startMonth);
    if (c.endMonth) assert(monthIndex(c.endMonth) >= monthIndex(c.startMonth));
    assert(c.intervalMonths >= 1 && c.intervalMonths <= 120);
    validateMoney(c.amount, true);
    assert(c.amount);
    c.exchangeRate = "";
  }
  async function validateRule(r: p.CategorizationRule) {
    const c = await category(r.categoryId);
    assert(r.name.trim() && r.name.length <= 100);
    assert(!r.type || r.type === c.type, "CATEGORY_TYPE_MISMATCH");
    r.type = c.type;
    if (r.currencyCode) digits(r.currencyCode);
    assert(r.minMinorUnits === undefined || r.minMinorUnits >= 0n);
    assert(
      r.maxMinorUnits === undefined ||
        r.maxMinorUnits >= (r.minMinorUnits ?? 0n),
    );
    assert(
      (r.minMinorUnits === undefined && r.maxMinorUnits === undefined) ||
        r.currencyCode,
      "CURRENCY_REQUIRED",
    );
  }
  async function validateScenario(s: p.Scenario) {
    assert(s.name.trim() && s.name.length <= 100);
    assert(s.overrides.length <= 500);
    for (const o of s.overrides) {
      monthIndex(o.month);
      await category(o.categoryId);
      validateMoney(o.amount);
    }
  }
  return {
    allCategories,
    allRules,
    allTransactions,
    category,
    transaction,
    normalizeTransaction,
    saveTransaction,
    filterTransactions,
    reportData,
    validateCategory,
    validateBudget,
    validateCommitment,
    validateRule,
    validateScenario,
  };
}
export function fingerprint(t: p.Transaction): string {
  return JSON.stringify([
    t.importSource.trim().toLowerCase(),
    t.externalId,
    dateString(t.date),
    t.amount?.minorUnits.toString(),
    t.amount?.currencyCode,
    t.counterparty.trim().toLowerCase().replace(/\s+/g, " "),
    t.note.trim().toLowerCase().replace(/\s+/g, " "),
  ]);
}
export type Service = ReturnType<typeof service>;
