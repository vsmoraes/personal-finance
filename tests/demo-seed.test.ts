import { createHash, randomUUID } from "node:crypto";

import { create } from "@bufbuild/protobuf";
import { expect, it } from "vitest";

import { csvAdapter } from "../apps/api/src/adapters/import/csv.js";
import { FinanceApplication } from "../packages/application/src/finance-application.js";
import { ReportRequestSchema } from "../packages/contracts/src/finance/v1/finance_pb.js";
import { createSqliteAdapter } from "../packages/database/src/adapter.js";
import { openDatabase } from "../packages/database/src/index.js";
import { DEMO_CUTOFF, seedDemo } from "../scripts/demo/seed.js";

it("seeds realistic history, keeps settings, reconciles reports and is repeatable", () => {
  const connection = openDatabase(":memory:");
  try {
    const store = createSqliteAdapter(connection);
    const finance = new FinanceApplication(
      store,
      {
        id: randomUUID,
        now: () => "2026-09-20T12:00:00Z",
        hash: (value) => createHash("sha256").update(value).digest("hex"),
      },
      csvAdapter,
    );
    const settings = finance.settings();
    expect(seedDemo(finance, store)).toEqual({ seeded: true });
    const transactions = finance.list("transactions");
    expect(transactions).toHaveLength(727);
    expect(
      new Set(transactions.map((tr) => tr.amount?.currencyCode)).size,
    ).toBe(6);
    expect(transactions.some((tr) => tr.ruleId)).toBe(true);
    expect(
      transactions.every(
        (tr) =>
          tr.date &&
          `${tr.date.year}-${String(tr.date.month).padStart(2, "0")}-${String(tr.date.day).padStart(2, "0")}` <=
            DEMO_CUTOFF,
      ),
    ).toBe(true);
    for (const year of [2025, 2026]) {
      const report = finance.report(
        "monthly",
        create(ReportRequestSchema, { year }),
      );
      expect(report.rows).toHaveLength(12);
      expect(report.rows.reduce((sum, row) => sum + row.expenses, 0n)).toBe(
        report.totals?.expenses,
      );
      expect(report.rows.reduce((sum, row) => sum + row.netSavings, 0n)).toBe(
        report.totals?.netSavings,
      );
      if (year === 2025) expect(report.rows[1]?.income).toBe(0n);
    }
    expect(
      finance.list("categories").some((category) => category.archived),
    ).toBe(true);
    expect(
      finance
        .list("categories")
        .some((category) => category.defaultBudget?.minorUnits === 0n),
    ).toBe(true);
    expect(finance.list("scenarios")).toHaveLength(3);
    expect(seedDemo(finance, store)).toEqual({ seeded: false });
    expect(finance.list("transactions")).toEqual(transactions);
    expect(finance.settings()).toEqual(settings);
  } finally {
    connection.sqlite.close();
  }
});
