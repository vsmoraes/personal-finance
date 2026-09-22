/* eslint-disable */
// @ts-nocheck
import { create } from "@bufbuild/protobuf";
import type { FinanceApplication } from "../../packages/application/src/finance-application.js";
import type { FinanceStore } from "../../packages/application/src/ports.js";
import * as p from "../../packages/contracts/src/finance/v1/finance_pb.js";
import { parseDate } from "../../packages/domain/src/finance.js";
import { assert, money } from "../../packages/domain/src/money.js";

export const DEMO_MARKER = "demo-seed:2025-2026:v1";
export const DEMO_NOTE = "DEMO 2025-2026 |";
export const DEMO_CUTOFF = "2026-09-20";
export const DEMO_IMPORT_SOURCE = "demo-2025-2026-import";

const expensePlans = [
  ["housing", 95000n, 95000n],
  ["utilities", 12000n, 15500n],
  ["phone-internet", 5500n, 6000n],
  ["groceries", 34000n, 38000n],
  ["transportation", 11000n, 15000n],
  ["insurance", 7200n, 8000n],
  ["healthcare", 6000n, 9000n],
  ["debt", 14000n, 14000n],
  ["dining", 18000n, 16000n],
  ["shopping", 12000n, 14000n],
  ["entertainment", 7500n, 10000n],
  ["travel", 11000n, 22000n],
  ["education", 6500n, 10000n],
  ["gifts", 4500n, 7000n],
  ["pets", 5200n, 6500n],
  ["taxes", 12500n, 14000n],
  ["other-expenses", 4800n, 5500n],
] as const;

/** Opt-in demo driving adapter: all financial writes use the real application ports. */
export function seedDemo(finance: FinanceApplication, store: FinanceStore) {
  return store.atomic(() => {
    if (store.getIdempotency(DEMO_MARKER)) return { seeded: false };
    for (const [categoryId] of expensePlans) {
      assert(
        !finance.get("categories", categoryId).archived,
        "DEMO_CATEGORY_ARCHIVED",
      );
    }

    const eur = (minor: bigint) => money(minor, "EUR");
    const category = (
      name: string,
      budget: bigint | undefined,
      budgetable = true,
    ) =>
      finance.save(
        "categories",
        create(p.CategorySchema, {
          name: `Demo · ${name}`,
          type: p.TransactionType.EXPENSE,
          color: "#8b5a2b",
          icon: "TagOutlined",
          budgetable,
          position: 100,
          ...(budget === undefined ? {} : { defaultBudget: eur(budget) }),
        }),
      );
    const hobbies = category("Hobbies", 9000n);
    const unplanned = category("Zero-budget purchases", 0n);
    const unbudgeted = category("No budget", undefined);
    const excluded = category("Non-budgetable expenses", undefined, false);
    const archived = category("Retired activity", undefined);

    // Respect configured budgets: only introduce ranges for categories with no existing budget setup.
    const existingBudgets = finance.list("budgets");
    for (const [categoryId, , planned] of expensePlans) {
      const c = finance.get("categories", categoryId);
      if (categoryId === "housing" || categoryId === "insurance") continue;
      if (
        !c.budgetable ||
        c.defaultBudget ||
        existingBudgets.some((b) => b.categoryId === categoryId)
      )
        continue;
      finance.save(
        "budgets",
        create(p.BudgetSchema, {
          categoryId,
          startMonth: "2025-01",
          endMonth: "2026-12",
          amount: eur(planned),
        }),
      );
      if (categoryId === "travel" || categoryId === "gifts") {
        finance.save(
          "budgets",
          create(p.BudgetSchema, {
            categoryId,
            startMonth: "2025-12",
            endMonth: "2025-12",
            amount: eur(planned * 3n),
          }),
        );
        finance.save(
          "budgets",
          create(p.BudgetSchema, {
            categoryId,
            startMonth: "2026-07",
            endMonth: "2026-08",
            amount: eur(planned * 2n),
          }),
        );
      }
    }

    const rule = (
      name: string,
      categoryId: string,
      priority: number,
      conditions: Partial<Omit<p.CategorizationRule, "$typeName">>,
    ) =>
      finance.save(
        "rules",
        create(p.CategorizationRuleSchema, {
          name: `Demo · ${name}`,
          categoryId,
          priority,
          enabled: true,
          ...conditions,
        }),
      );
    rule("Imported groceries", "groceries", -30, {
      importSourceContains: DEMO_IMPORT_SOURCE,
      counterpartyContains: "Demo Market",
      currencyCode: "EUR",
    });
    rule("Imported transit", "transportation", -20, {
      importSourceContains: DEMO_IMPORT_SOURCE,
      noteContains: "commute",
      currencyCode: "EUR",
      minMinorUnits: 500n,
      maxMinorUnits: 10000n,
    });
    rule("Imported income", "freelance", -10, {
      importSourceContains: DEMO_IMPORT_SOURCE,
      counterpartyContains: "Demo Project",
    });
    rule("Excluded purchase", "shopping", 10, {
      noteContains: `${DEMO_NOTE} excluded`,
      includeInBudget: false,
    });
    rule("Exact subscription amount (disabled)", "entertainment", 20, {
      counterpartyContains: "Demo Stream",
      currencyCode: "EUR",
      minMinorUnits: 1299n,
      maxMinorUnits: 1299n,
      enabled: false,
    });

    for (const input of [
      {
        categoryId: "salary",
        description: "Demo · Monthly salary",
        amount: eur(350000n),
        intervalMonths: 1,
        contributesToBudget: false,
      },
      {
        categoryId: "freelance",
        description: "Demo · Quarterly project",
        amount: eur(75000n),
        intervalMonths: 3,
        contributesToBudget: false,
      },
      {
        categoryId: "housing",
        description: "Demo · Monthly rent",
        amount: eur(95000n),
        intervalMonths: 1,
        contributesToBudget: true,
      },
      {
        categoryId: "insurance",
        description: "Demo · Quarterly insurance",
        amount: eur(21600n),
        intervalMonths: 3,
        contributesToBudget: true,
      },
      {
        categoryId: hobbies.id,
        description: "Demo · Activity membership",
        amount: eur(2000n),
        intervalMonths: 1,
        contributesToBudget: true,
      },
      {
        categoryId: "entertainment",
        description: "Demo · Foreign subscription",
        amount: money(1299n, "USD"),
        intervalMonths: 1,
        contributesToBudget: true,
      },
    ]) {
      finance.save(
        "commitments",
        create(p.RecurringCommitmentSchema, {
          ...input,
          startMonth: "2025-01",
          endMonth: "2026-12",
        }),
      );
    }

    let sequence = 0;
    const add = (
      date: string,
      categoryId: string,
      minor: bigint,
      description: string,
      options: {
        income?: boolean;
        currency?: string;
        includeInBudget?: boolean;
      } = {},
    ) => {
      if (date > DEMO_CUTOFF) return;
      finance.createTransaction(
        create(p.TransactionSchema, {
          date: parseDate(date),
          type: options.income
            ? p.TransactionType.INCOME
            : p.TransactionType.EXPENSE,
          categoryId,
          amount: money(minor, options.currency ?? "EUR"),
          counterparty: `Demo ${description}`,
          note: `${DEMO_NOTE} ${description}`,
          includeInBudget: options.includeInBudget ?? true,
        }),
        `${DEMO_MARKER}:transaction:${sequence++}`,
      );
    };

    for (const year of [2025, 2026]) {
      for (let month = 1; month <= 12; month++) {
        const prefix = `${year}-${String(month).padStart(2, "0")}`;
        if (`${prefix}-01` > DEMO_CUTOFF) continue;
        const date = (day: number) =>
          `${prefix}-${String(day).padStart(2, "0")}`;
        // One deliberately income-free month makes zero-income handling easy to inspect.
        if (!(year === 2025 && month === 2)) {
          add(date(1), "salary", year === 2025 ? 325000n : 350000n, "Payroll", {
            income: true,
          });
          add(
            date(17),
            "investment",
            2200n + BigInt(month) * 130n,
            "Investment distribution",
            { income: true },
          );
          if (month % 3 === 0)
            add(
              date(11),
              "freelance",
              68000n + BigInt(month) * 700n,
              "Project invoice",
              { income: true },
            );
          if (month % 4 === 0)
            add(date(15), "refunds", 4599n, "Purchase refund", {
              income: true,
            });
          if (month === 12)
            add(date(18), "other-income", 30000n, "Annual bonus", {
              income: true,
            });
        }
        expensePlans.forEach(([categoryId, typical], index) => {
          // Integer-only, deterministic variation produces over/under-budget months.
          const factor = 85n + BigInt((month * 7 + index * 11 + year) % 36);
          let amount =
            categoryId === "housing" || categoryId === "debt"
              ? typical
              : (typical * factor) / 100n;
          if (categoryId === "travel" && (month === 7 || month === 12))
            amount *= 5n;
          const parts =
            categoryId === "groceries" ? 4 : categoryId === "dining" ? 3 : 1;
          for (let part = 0; part < parts; part++) {
            const installment =
              part === parts - 1
                ? amount - (amount / BigInt(parts)) * BigInt(parts - 1)
                : amount / BigInt(parts);
            add(
              date(parts > 1 ? 4 + part * 7 : 2 + (index % 17)),
              categoryId,
              installment,
              `${categoryId} ${part + 1}`,
            );
          }
        });
        add(
          date(9),
          "shopping",
          4999n + BigInt(month) * 100n,
          "International shop",
          { currency: "USD" },
        );
        add(date(10), "education", 2900n, "Online workshop", {
          currency: "GBP",
        });
        add(date(12), "gifts", 8500n, "Overseas gift", { currency: "BRL" });
        add(date(14), "dining", 2400n, "Travel meal", { currency: "JPY" });
        add(date(16), "transportation", 7250n, "Travel transit", {
          currency: "KWD",
        });
        add(
          date(18),
          hobbies.id,
          7500n + BigInt(month) * 400n,
          "Hobby supplies",
        );
        if (month % 3 === 0)
          add(date(19), unplanned.id, 2200n, "Unplanned purchase");
        if (month % 2 === 0)
          add(date(13), unbudgeted.id, 3300n, "Unbudgeted expense");
        if (month % 4 === 0)
          add(date(17), excluded.id, 4500n, "Non-budgetable expense");
        if (month === 5)
          add(date(20), "shopping", 25000n, "excluded business purchase", {
            includeInBudget: false,
          });
      }
    }
    add("2025-06-15", archived.id, 6000n, "Retired activity membership");
    finance.remove("categories", archived.id, archived.version);

    // Exercise actual import normalization, categorization, duplicate detection and confirmation.
    const rows = ["date,amount,currency,counterparty,note,externalId"];
    for (const year of [2025, 2026]) {
      for (let month = 1; month <= 12; month++) {
        const date = `${year}-${String(month).padStart(2, "0")}-08`;
        if (date > DEMO_CUTOFF) continue;
        rows.push(
          `${date},-32.45,EUR,Demo Market,${DEMO_NOTE} imported groceries,market-${year}-${month}`,
        );
        rows.push(
          `${date},-18.00,EUR,Demo Transit,${DEMO_NOTE} commute,transit-${year}-${month}`,
        );
        if (!(year === 2025 && month === 2))
          rows.push(
            `${date},175.00,EUR,Demo Project,${DEMO_NOTE} imported income,project-${year}-${month}`,
          );
      }
    }
    assert(rows[1]);
    rows.push(rows[1]);
    const imported = finance.imports.preview(
      create(p.ImportRequestSchema, {
        filename: "demo-history.csv",
        source: DEMO_IMPORT_SOURCE,
        contentBase64: Buffer.from(rows.join("\n")).toString("base64"),
        dateFormat: "yyyy-MM-dd",
        decimalSeparator: ".",
        defaultCurrency: "EUR",
        columns: {
          date: "date",
          amount: "amount",
          currency: "currency",
          counterparty: "counterparty",
          note: "note",
          externalId: "externalId",
        },
      }),
    );
    assert(
      imported.rows.every((row) => row.errors.length === 0),
      "DEMO_IMPORT_INVALID",
    );
    finance.imports.confirm(imported.id);
    // Leave a failed preview for the downloadable row-error report, without inserting invalid transactions.
    finance.imports.preview(
      create(p.ImportRequestSchema, {
        filename: "demo-invalid.csv",
        source: "demo-validation-preview",
        contentBase64: Buffer.from(
          "date,amount\n2026-02-30,-12.00\n2026-09-02,not-a-number",
        ).toString("base64"),
        dateFormat: "yyyy-MM-dd",
        decimalSeparator: ".",
        defaultCurrency: "EUR",
        columns: { date: "date", amount: "amount" },
      }),
    );

    const overrides = (
      spending: bigint,
      salary: bigint,
    ): p.ScenarioOverride[] =>
      [10, 11, 12].flatMap((month) => [
        create(p.ScenarioOverrideSchema, {
          month: `2026-${month}`,
          categoryId: "groceries",
          amount: eur(spending),
        }),
        create(p.ScenarioOverrideSchema, {
          month: `2026-${month}`,
          categoryId: "salary",
          amount: eur(salary),
        }),
      ]);
    finance.save(
      "scenarios",
      create(p.ScenarioSchema, {
        name: "Demo · Lower spending",
        overrides: overrides(28000n, 350000n),
      }),
    );
    finance.save(
      "scenarios",
      create(p.ScenarioSchema, {
        name: "Demo · Higher income",
        overrides: overrides(38000n, 390000n),
      }),
    );
    finance.save(
      "scenarios",
      create(p.ScenarioSchema, {
        name: "Demo · Unexpected expense",
        overrides: [
          create(p.ScenarioOverrideSchema, {
            month: "2026-11",
            categoryId: "healthcare",
            amount: eur(180000n),
            additional: true,
          }),
        ],
      }),
    );
    store.saveIdempotency(DEMO_MARKER, DEMO_MARKER, "complete");
    store.audit("demo-seed", "create", DEMO_MARKER);
    return { seeded: true };
  });
}
