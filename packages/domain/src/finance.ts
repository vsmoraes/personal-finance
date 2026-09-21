import { create } from "@bufbuild/protobuf";

import {
  type Budget,
  type CategorizationRule,
  CategorizationSource,
  type Category,
  type Date as FinancialDate,
  DateSchema,
  type RecurringCommitment,
  type ReportRow,
  ReportRowSchema,
  type RuleMatch,
  RuleMatchSchema,
  type Scenario,
  type Transaction,
  TransactionType,
} from "../../contracts/src/finance/v1/finance_pb.js";
import { assert } from "./money.js";
export function dateString(date: FinancialDate | undefined): string {
  assert(date, "INVALID_DATE");
  const str = `${date.year.toString().padStart(4, "0")}-${date.month.toString().padStart(2, "0")}-${date.day.toString().padStart(2, "0")}`;
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(str) &&
      date.year >= 1900 &&
      date.month >= 1 &&
      date.month <= 12 &&
      date.day >= 1 &&
      date.day <= 31 &&
      new globalThis.Date(`${str}T12:00:00Z`).toISOString().slice(0, 10) ===
        str,
    "INVALID_DATE",
  );
  return str;
}
export function parseDate(value: string): FinancialDate {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value), "INVALID_DATE");
  const [year, month, day] = value.split("-").map(Number);
  const result = create(DateSchema, {
    year: year ?? 0,
    month: month ?? 0,
    day: day ?? 0,
  });
  dateString(result);
  return result;
}
export function monthIndex(month: string): number {
  assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), "INVALID_DATE");
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}
export function occurs(
  commitment: RecurringCommitment,
  month: string,
): boolean {
  const index = monthIndex(month);
  const start = monthIndex(commitment.startMonth);
  return (
    index >= start &&
    (!commitment.endMonth || index <= monthIndex(commitment.endMonth)) &&
    (index - start) % commitment.intervalMonths === 0
  );
}
export function applyRules(
  transaction: Transaction,
  rules: CategorizationRule[],
  overwriteManual = false,
): { transaction: Transaction; matches: RuleMatch[] } {
  const updated = { ...transaction };
  const matches: RuleMatch[] = [];
  if (
    transaction.categorizationSource === CategorizationSource.MANUAL &&
    !overwriteManual
  )
    return { transaction: updated, matches };
  for (const rule of [...rules].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  )) {
    if (!rule.enabled) continue;
    const reasons: string[] = [];
    const textConditions: [string, string, string][] = [
      ["counterparty", rule.counterpartyContains, transaction.counterparty],
      ["note", rule.noteContains, transaction.note],
      ["importSource", rule.importSourceContains, transaction.importSource],
    ];
    if (
      textConditions.some(
        ([, needle, haystack]) =>
          needle &&
          !haystack
            .toLocaleLowerCase("en")
            .includes(needle.toLocaleLowerCase("en")),
      )
    )
      continue;
    if (rule.type && rule.type !== transaction.type) continue;
    if (
      rule.currencyCode &&
      rule.currencyCode !== transaction.amount?.currencyCode
    )
      continue;
    if (
      rule.minMinorUnits !== undefined &&
      (transaction.amount?.minorUnits ?? 0n) < rule.minMinorUnits
    )
      continue;
    if (
      rule.maxMinorUnits !== undefined &&
      (transaction.amount?.minorUnits ?? 0n) > rule.maxMinorUnits
    )
      continue;
    for (const [key, needle] of textConditions) if (needle) reasons.push(key);
    if (rule.type) reasons.push("type");
    if (rule.currencyCode) reasons.push("currency");
    if (rule.minMinorUnits !== undefined || rule.maxMinorUnits !== undefined)
      reasons.push("amount");
    if (!reasons.length) reasons.push("all");
    updated.categoryId = rule.categoryId;
    updated.ruleId = rule.id;
    updated.categorizationSource = CategorizationSource.RULE;
    if (rule.includeInBudget !== undefined)
      updated.includeInBudget = rule.includeInBudget;
    matches.push(
      create(RuleMatchSchema, {
        transactionId: transaction.id,
        ruleId: rule.id,
        categoryId: rule.categoryId,
        reasons,
      }),
    );
    if (!rule.continueMatching) break;
  }
  return { transaction: updated, matches };
}
export type ReportData = {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  commitments: RecurringCommitment[];
  currency: string;
};
export function categoryBudget(
  data: ReportData,
  category: Category,
  month: string,
): bigint | undefined {
  if (!category.budgetable) return undefined;
  const override = data.budgets
    .filter(
      (b) =>
        b.categoryId === category.id &&
        b.amount?.currencyCode === data.currency &&
        b.startMonth <= month &&
        (!b.endMonth || b.endMonth >= month),
    )
    .sort(
      (a, b) =>
        b.startMonth.localeCompare(a.startMonth) || a.id.localeCompare(b.id),
    )[0];
  let value =
    override?.amount?.minorUnits ??
    (category.defaultBudget?.currencyCode === data.currency
      ? category.defaultBudget.minorUnits
      : undefined);
  for (const c of data.commitments.filter(
    (c) =>
      c.categoryId === category.id &&
      c.amount?.currencyCode === data.currency &&
      c.contributesToBudget &&
      occurs(c, month),
  )) {
    assert(c.amount);
    value = (value ?? 0n) + c.amount.minorUnits;
  }
  return value;
}
function finish(row: ReportRow): ReportRow {
  row.netSavings = row.income - row.expenses;
  row.savingsRate = row.income
    ? ((row.netSavings * 10000n) / row.income).toString()
    : "";
  return row;
}
export function totalRows(rows: ReportRow[]): ReportRow {
  const result = create(ReportRowSchema, { key: "total" });
  for (const r of rows) {
    result.income += r.income;
    result.expenses += r.expenses;
    if (r.budget !== undefined)
      result.budget = (result.budget ?? 0n) + r.budget;
    if (r.variance !== undefined)
      result.variance = (result.variance ?? 0n) + r.variance;
  }
  return finish(result);
}
export function monthlyReport(data: ReportData, year: number): ReportRow[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    const row = create(ReportRowSchema, { key: month, actual: true });
    let budgetExpenses = 0n;
    for (const c of data.categories.filter(
      (c) => c.type === TransactionType.EXPENSE,
    )) {
      const budget = categoryBudget(data, c, month);
      if (budget !== undefined) row.budget = (row.budget ?? 0n) + budget;
      for (const t of data.transactions.filter(
        (t) =>
          t.categoryId === c.id &&
          t.amount?.currencyCode === data.currency &&
          dateString(t.date).startsWith(month),
      )) {
        if (budget !== undefined && t.includeInBudget)
          budgetExpenses += t.amount?.minorUnits ?? 0n;
      }
    }
    for (const t of data.transactions.filter(
      (t) =>
        t.amount?.currencyCode === data.currency &&
        dateString(t.date).startsWith(month),
    )) {
      if (t.type === TransactionType.INCOME)
        row.income += t.amount?.minorUnits ?? 0n;
      else row.expenses += t.amount?.minorUnits ?? 0n;
    }
    if (row.budget !== undefined) row.variance = row.budget - budgetExpenses;
    return finish(row);
  });
}
export function categoryReport(
  data: ReportData,
  year: number,
  selectedMonth: number,
): ReportRow[] {
  return data.categories
    .filter((c) => c.type === TransactionType.EXPENSE)
    .map((c) => {
      const row = create(ReportRowSchema, { key: c.id, actual: true });
      let included = 0n;
      for (let m = 1; m <= 12; m++) {
        if (selectedMonth && m !== selectedMonth) continue;
        const month = `${year}-${String(m).padStart(2, "0")}`;
        const budget = categoryBudget(data, c, month);
        if (budget !== undefined) row.budget = (row.budget ?? 0n) + budget;
        for (const t of data.transactions.filter(
          (t) =>
            t.categoryId === c.id &&
            t.amount?.currencyCode === data.currency &&
            dateString(t.date).startsWith(month),
        )) {
          row.expenses += t.amount?.minorUnits ?? 0n;
          if (budget !== undefined && t.includeInBudget)
            included += t.amount?.minorUnits ?? 0n;
        }
      }
      if (row.budget !== undefined) row.variance = row.budget - included;
      return finish(row);
    });
}
export function forecast(
  data: ReportData,
  year: number,
  asOf: string,
  scenario?: Scenario,
): ReportRow[] {
  parseDate(asOf);
  return monthlyReport(data, year).map((row) => {
    if (row.key < asOf.slice(0, 7)) return row;
    row.actual = false;
    let income = row.income;
    let expenses = row.expenses;
    for (const category of data.categories) {
      const budget = categoryBudget(data, category, row.key) ?? 0n;
      let expected = budget;
      for (const c of data.commitments.filter(
        (c) =>
          c.categoryId === category.id &&
          c.amount?.currencyCode === data.currency &&
          occurs(c, row.key),
      )) {
        if (!c.contributesToBudget || !category.budgetable) {
          assert(c.amount);
          expected += c.amount.minorUnits;
        }
      }
      for (const o of scenario?.overrides.filter(
        (o) =>
          o.month === row.key &&
          o.categoryId === category.id &&
          o.amount?.currencyCode === data.currency,
      ) ?? []) {
        expected = o.additional
          ? expected + (o.amount?.minorUnits ?? 0n)
          : (o.amount?.minorUnits ?? 0n);
      }
      const actual = data.transactions
        .filter(
          (t) =>
            t.categoryId === category.id &&
            t.amount?.currencyCode === data.currency &&
            dateString(t.date).startsWith(row.key),
        )
        .reduce((a, t) => a + (t.amount?.minorUnits ?? 0n), 0n);
      const extra = expected > actual ? expected - actual : 0n;
      if (category.type === TransactionType.INCOME) income += extra;
      else expenses += extra;
    }
    row.income = income;
    row.expenses = expenses;
    if (row.budget !== undefined) row.variance = row.budget - expenses;
    return finish(row);
  });
}
