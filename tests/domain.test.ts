import { create } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import * as p from "../packages/contracts/src/finance/v1/finance_pb.js";
import {
  applyRules,
  categoryBudget,
  categoryReport,
  dateString,
  forecast,
  monthIndex,
  monthlyReport,
  occurs,
  parseDate,
  type ReportData,
  totalRows,
} from "../packages/domain/src/finance.js";
import {
  assert,
  decimalAmount,
  digits,
  formatMoney,
  money,
  parseAmount,
} from "../packages/domain/src/money.js";
const expense = (id = "food", budget?: bigint) =>
  create(p.CategorySchema, {
    id,
    type: p.TransactionType.EXPENSE,
    budgetable: true,
    ...(budget === undefined ? {} : { defaultBudget: money(budget, "EUR") }),
  });
const transaction = (
  categoryId = "food",
  amount = 100n,
  month = "2026-01",
  type = p.TransactionType.EXPENSE,
) =>
  create(p.TransactionSchema, {
    id: "transaction",
    categoryId,
    type,
    date: parseDate(`${month}-15`),
    amount: money(amount, "EUR"),
    includeInBudget: true,
  });
const data = (overrides: Partial<ReportData> = {}): ReportData => ({
  transactions: [],
  categories: [expense()],
  budgets: [],
  commitments: [],
  currency: "EUR",
  ...overrides,
});
describe("exact money", () => {
  it.each([
    ["EUR", "123.45", 12345n, 2],
    ["JPY", "123", 123n, 0],
    ["KWD", "123.456", 123456n, 3],
  ] as const)("parses and formats %s", (currency, amount, minor, precision) => {
    expect(digits(currency)).toBe(precision);
    expect(parseAmount(amount, currency)).toBe(minor);
    expect(decimalAmount(minor, currency)).toBe(amount);
    expect(decimalAmount(-minor, currency)).toBe(`-${amount}`);
  });
  it.each(["-1", "1e3", "NaN", "", "1.123", "9999999999999999999999"])(
    "rejects invalid money %s",
    (value) => expect(() => parseAmount(value, "EUR")).toThrow(),
  );
  it("validates currencies and exact zero", () => {
    expect(() => digits("ABC")).toThrow();
    expect(parseAmount("0", "JPY")).toBe(0n);
    expect(parseAmount("1", "EUR")).toBe(100n);
    expect(() => assert(false)).toThrow("INVALID_INPUT");
  });
  it("protects int64 and formats beyond Number safe precision", () => {
    expect(() => parseAmount("92233720368547758.08", "EUR")).toThrow();
    expect(formatMoney(9007199254740993n, "EUR", "en")).toContain(
      "90,071,992,547,409.93",
    );
    expect(formatMoney(12345n, "EUR", "es")).toContain("123,45");
    expect(formatMoney(12345n, "BRL", "pt-BR")).toContain("123,45");
  });
});
describe("financial dates", () => {
  it("round-trips date-only values", () =>
    expect(dateString(parseDate("2024-02-29"))).toBe("2024-02-29"));
  it.each([
    "2023-02-29",
    "2024-13-01",
    "2024-00-01",
    "2024-01-00",
    "2024-01-32",
    "2024/01/01",
    "1899-01-01",
  ])("rejects %s", (value) => expect(() => parseDate(value)).toThrow());
  it("rejects missing date and invalid month", () => {
    expect(() => dateString(undefined)).toThrow();
    expect(() => monthIndex("2024-13")).toThrow();
  });
});
describe("rules", () => {
  const rule = (input: Partial<Omit<p.CategorizationRule, "$typeName">> = {}) =>
    create(p.CategorizationRuleSchema, {
      id: "r",
      name: "Example",
      enabled: true,
      categoryId: "matched",
      ...input,
    });
  const source = () => ({
    ...transaction(),
    counterparty: "Example text",
    note: "reference",
    importSource: "generic",
  });
  it("matches combinations and records explanations", () => {
    const r = rule({
      counterpartyContains: "EXAMPLE",
      noteContains: "ref",
      importSourceContains: "gen",
      type: p.TransactionType.EXPENSE,
      currencyCode: "EUR",
      minMinorUnits: 100n,
      maxMinorUnits: 100n,
      includeInBudget: false,
    });
    const result = applyRules(source(), [r]);
    expect(result.transaction.categoryId).toBe("matched");
    expect(result.transaction.includeInBudget).toBe(false);
    expect(result.matches[0]?.reasons).toEqual([
      "counterparty",
      "note",
      "importSource",
      "type",
      "currency",
      "amount",
    ]);
  });
  it.each([
    { enabled: false },
    { counterpartyContains: "absent" },
    { noteContains: "absent" },
    { importSourceContains: "absent" },
    { type: p.TransactionType.INCOME },
    { currencyCode: "JPY" },
    { minMinorUnits: 101n },
    { maxMinorUnits: 99n },
  ])("does not match %s", (input) =>
    expect(applyRules(source(), [rule(input)]).matches).toHaveLength(0),
  );
  it("orders rules, stops and continues explicitly", () => {
    const first = rule({ id: "a", priority: 1, categoryId: "first" });
    const last = rule({ id: "b", priority: 2, categoryId: "last" });
    expect(applyRules(source(), [last, first]).transaction.categoryId).toBe(
      "first",
    );
    first.continueMatching = true;
    expect(applyRules(source(), [last, first]).transaction.categoryId).toBe(
      "last",
    );
    expect(
      applyRules(source(), [rule({ id: "z" }), rule({ id: "a" })]).matches[0]
        ?.ruleId,
    ).toBe("a");
  });
  it("protects manual categories unless explicitly overridden", () => {
    const t = {
      ...source(),
      categorizationSource: p.CategorizationSource.MANUAL,
    };
    expect(applyRules(t, [rule()]).matches).toHaveLength(0);
    expect(applyRules(t, [rule()], true).matches[0]?.reasons).toEqual(["all"]);
  });
  it("handles missing amount defensively", () => {
    const t = source();
    delete t.amount;
    expect(applyRules(t, [rule({ minMinorUnits: 1n })]).matches).toHaveLength(
      0,
    );
    expect(applyRules(t, [rule({ maxMinorUnits: 1n })]).matches).toHaveLength(
      1,
    );
  });
});
describe("budgets and reports", () => {
  it("always returns 12 months and separate annual totals", () => {
    const rows = monthlyReport(data(), 2026);
    expect(rows).toHaveLength(12);
    expect(
      rows.every(
        (r) => r.income === 0n && r.expenses === 0n && r.savingsRate === "",
      ),
    ).toBe(true);
    expect(totalRows(rows).key).toBe("total");
    expect(rows.some((r) => r.key === "total")).toBe(false);
  });
  it("distinguishes absent and zero budgets and excludes opted-out expenses", () => {
    const tx = transaction();
    expect(
      monthlyReport(data({ transactions: [tx] }), 2026)[0]?.variance,
    ).toBeUndefined();
    expect(
      monthlyReport(
        data({ categories: [expense("food", 0n)], transactions: [tx] }),
        2026,
      )[0]?.variance,
    ).toBe(-100n);
    tx.includeInBudget = false;
    expect(
      monthlyReport(
        data({ categories: [expense("food", 0n)], transactions: [tx] }),
        2026,
      )[0]?.variance,
    ).toBe(0n);
    expect(
      categoryBudget(data(), { ...expense(), budgetable: false }, "2026-01"),
    ).toBeUndefined();
  });
  it("reconciles income, expense, savings, rate and variance exactly", () => {
    const d = data({
      categories: [expense("food", 200n)],
      transactions: [
        transaction(),
        transaction("income", 400n, "2026-01", p.TransactionType.INCOME),
        transaction("food", 50n, "2026-02"),
      ],
    });
    const rows = monthlyReport(d, 2026);
    expect(rows[0]).toMatchObject({
      income: 400n,
      expenses: 100n,
      netSavings: 300n,
      budget: 200n,
      variance: 100n,
      savingsRate: "7500",
    });
    const total = totalRows(rows);
    expect(total).toMatchObject({
      income: 400n,
      expenses: 150n,
      netSavings: 250n,
      budget: 2400n,
      variance: 2250n,
    });
    expect(categoryReport(d, 2026, 0)[0]?.expenses).toBe(150n);
    expect(categoryReport(d, 2026, 1)[0]?.expenses).toBe(100n);
  });
  it("uses precise ranges and additive commitments", () => {
    const c = expense("food", 20n);
    const d = data({
      categories: [c],
      budgets: [
        create(p.BudgetSchema, {
          id: "a",
          categoryId: "food",
          startMonth: "2026-02",
          endMonth: "2026-03",
          amount: money(30n, "EUR"),
        }),
        create(p.BudgetSchema, {
          id: "b",
          categoryId: "food",
          startMonth: "2026-03",
          amount: money(40n, "EUR"),
        }),
      ],
      commitments: [
        create(p.RecurringCommitmentSchema, {
          categoryId: "food",
          startMonth: "2026-01",
          intervalMonths: 2,
          amount: money(5n, "EUR"),
          contributesToBudget: true,
        }),
      ],
    });
    expect(categoryBudget(d, c, "2026-01")).toBe(25n);
    expect(categoryBudget(d, c, "2026-02")).toBe(30n);
    expect(categoryBudget(d, c, "2026-03")).toBe(45n);
    expect(categoryBudget(d, c, "2027-01")).toBe(45n);
    expect(categoryReport(d, 2026, 0)[0]?.budget).toBe(480n);
  });
  it("applies commitment end month and interval", () => {
    const c = create(p.RecurringCommitmentSchema, {
      startMonth: "2026-02",
      endMonth: "2026-04",
      intervalMonths: 2,
    });
    expect(occurs(c, "2026-01")).toBe(false);
    expect(occurs(c, "2026-02")).toBe(true);
    expect(occurs(c, "2026-03")).toBe(false);
    expect(occurs(c, "2026-04")).toBe(true);
    expect(occurs(c, "2026-06")).toBe(false);
  });
  it("ignores legacy conversions and isolates original currencies", () => {
    const tx = transaction();
    tx.amount = money(10000n, "JPY");
    tx.baseAmount = money(6025n, "EUR");
    expect(
      totalRows(monthlyReport(data({ transactions: [tx] }), 2026)).expenses,
    ).toBe(0n);
    expect(
      totalRows(
        monthlyReport(data({ transactions: [tx], currency: "JPY" }), 2026),
      ).expenses,
    ).toBe(10000n);
  });
  it("ignores unrelated categories and missing amounts", () => {
    const tx = transaction();
    delete tx.amount;
    const d = data({
      transactions: [tx, transaction("different")],
      categories: [expense("food", 100n)],
    });
    expect(categoryReport(d, 2026, 2)[0]?.variance).toBe(100n);
    expect(categoryReport(d, 2026, 1)[0]?.expenses).toBe(0n);
    expect(monthlyReport(d, 2026)[0]?.expenses).toBe(100n);
  });
  it("retains no-budget in category reports", () =>
    expect(
      categoryReport(data({ transactions: [transaction()] }), 2026, 1)[0]
        ?.variance,
    ).toBeUndefined());
});
describe("forecast", () => {
  it("uses actuals, recurring income, category budgets and independent scenarios", () => {
    const d = data({
      categories: [
        expense("food", 100n),
        create(p.CategorySchema, {
          id: "income",
          type: p.TransactionType.INCOME,
        }),
      ],
      transactions: [
        transaction("food", 80n, "2026-01"),
        transaction("food", 30n, "2026-02"),
      ],
      commitments: [
        create(p.RecurringCommitmentSchema, {
          categoryId: "income",
          startMonth: "2026-01",
          intervalMonths: 1,
          amount: money(200n, "EUR"),
        }),
      ],
    });
    const baseline = forecast(d, 2026, "2026-02-15");
    expect(baseline[0]).toMatchObject({ actual: true, expenses: 80n });
    expect(baseline[1]).toMatchObject({
      actual: false,
      expenses: 100n,
      income: 200n,
      netSavings: 100n,
    });
    const scenario = create(p.ScenarioSchema, {
      overrides: [
        { month: "2026-03", categoryId: "food", amount: money(150n, "EUR") },
        {
          month: "2026-03",
          categoryId: "food",
          amount: money(20n, "EUR"),
          additional: true,
        },
      ],
    });
    expect(forecast(d, 2026, "2026-02-15", scenario)[2]?.expenses).toBe(170n);
    expect(d.categories[0]?.defaultBudget?.minorUnits).toBe(100n);
  });
  it("does not reduce already recorded current month spending", () => {
    const d = data({
      categories: [expense("food", 100n)],
      transactions: [transaction("food", 200n)],
    });
    expect(forecast(d, 2026, "2026-01-01")[0]?.expenses).toBe(200n);
  });
  it("counts automatic commitments once, even without a default budget", () => {
    const d = data({
      commitments: [
        create(p.RecurringCommitmentSchema, {
          categoryId: "food",
          amount: money(30n, "EUR"),
          startMonth: "2026-01",
          intervalMonths: 1,
          contributesToBudget: true,
        }),
      ],
    });
    expect(forecast(d, 2026, "2026-01-01")[1]?.expenses).toBe(30n);
    d.categories[0]!.budgetable = false;
    expect(forecast(d, 2026, "2026-01-01")[1]?.expenses).toBe(30n);
  });
});
