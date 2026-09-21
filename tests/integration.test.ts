import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fromJson,
  type JsonObject,
  toJson,
  toJsonString,
} from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../apps/api/src/app.js";
import * as p from "../packages/contracts/src/finance/v1/finance_pb.js";
let context: Awaited<ReturnType<typeof buildApp>>;
let directory: string;
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "finance-"));
  context = await buildApp({
    database: join(directory, "test.db"),
    webRoot: join(directory, "missing"),
  });
});
afterEach(async () => {
  await context.app.close();
  rmSync(directory, { recursive: true, force: true });
});
const transaction = (overrides: JsonObject = {}): JsonObject => ({
  date: { year: 2026, month: 1, day: 15 },
  type: "TRANSACTION_TYPE_EXPENSE",
  categoryId: "groceries",
  amount: { minorUnits: "12345", currencyCode: "EUR" },
  includeInBudget: true,
  ...overrides,
});
async function post(
  path: string,
  payload: JsonObject,
  headers: Record<string, string> = {},
) {
  return context.app.inject({
    method: "POST",
    url: `/api/v1/${path}`,
    payload,
    headers: { "idempotency-key": randomUUID(), ...headers },
  });
}
async function get(path: string) {
  return context.app.inject({ method: "GET", url: `/api/v1/${path}` });
}
async function makeTransaction(overrides: JsonObject = {}) {
  const response = await post("transactions", transaction(overrides));
  expect(response.statusCode, response.body).toBe(201);
  return fromJson(p.TransactionSchema, response.json());
}
async function updateCategory(id: string, overrides: JsonObject) {
  const old = fromJson(
    p.CategorySchema,
    (await get(`categories/${id}`)).json(),
  );
  const response = await context.app.inject({
    method: "PATCH",
    headers: { "content-type": "application/json" },
    url: `/api/v1/categories/${id}`,
    payload: { ...(toJson(p.CategorySchema, old) as JsonObject), ...overrides },
  });
  expect(response.statusCode, response.body).toBe(200);
  return fromJson(p.CategorySchema, response.json());
}
describe("HTTP contracts and SQLite persistence", () => {
  it("initializes seeds, migrates once and survives reopen", async () => {
    expect(context.store.sqlite.pragma("journal_mode", { simple: true })).toBe(
      "wal",
    );
    expect(context.store.sqlite.pragma("foreign_keys", { simple: true })).toBe(
      1,
    );
    expect(
      fromJson(p.FinanceResponseSchema, (await get("categories")).json())
        .categories,
    ).toHaveLength(22);
    const saved = await makeTransaction();
    await context.app.close();
    context = await buildApp({ database: join(directory, "test.db") });
    expect(
      fromJson(
        p.TransactionSchema,
        (await get(`transactions/${saved.id}`)).json(),
      ).amount?.minorUnits,
    ).toBe(12345n);
  });
  it("round-trips safe int64, audits, edits and protects versions", async () => {
    const tx = await makeTransaction({
      amount: { minorUnits: "9007199254740993", currencyCode: "EUR" },
    });
    expect(tx.amount?.minorUnits).toBe(9007199254740993n);
    const payload = JSON.stringify(
      toJson(p.TransactionSchema, { ...tx, note: "changed" }),
    );
    const updated = await context.app.inject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      url: `/api/v1/transactions/${tx.id}`,
      payload,
    });
    expect(updated.statusCode).toBe(200);
    expect(
      (
        await context.app.inject({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          url: `/api/v1/transactions/${tx.id}`,
          payload,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await context.app.inject({
          method: "DELETE",
          url: `/api/v1/transactions/${tx.id}`,
          headers: { "if-match": "1" },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await context.app.inject({
          method: "DELETE",
          url: `/api/v1/transactions/${tx.id}`,
          headers: { "if-match": "2" },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      context.store.sqlite
        .prepare("SELECT count(*) AS n FROM audit_events")
        .get(),
    ).toMatchObject({ n: 3 });
  });
  it("enforces idempotent creation", async () => {
    const key = randomUUID();
    const first = await post("transactions", transaction(), {
      "idempotency-key": key,
    });
    const second = await post("transactions", transaction(), {
      "idempotency-key": key,
    });
    expect(second.body).toBe(first.body);
    expect(
      (
        await post("transactions", transaction({ note: "different" }), {
          "idempotency-key": key,
        })
      ).statusCode,
    ).toBe(409);
  });
  it.each([
    { amount: { minorUnits: "-1", currencyCode: "EUR" } },
    { amount: { minorUnits: "0", currencyCode: "EUR" } },
    { date: { year: 2026, month: 2, day: 30 } },
    { date: { year: 2026, month: 13, day: 1 } },
    { categoryId: "missing" },
    { categoryId: "salary" },
    { amount: { minorUnits: "1", currencyCode: "ZZZ" } },
    { amount: { minorUnits: "1", currencyCode: "XYZ" } },
    { extra: "not allowed" },
  ])("rejects invalid transaction %s", async (input) => {
    const response = await post("transactions", transaction(input));
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode, response.body).toBeLessThan(500);
    expect(response.body).not.toContain(directory);
  });
  it("protects same origin, sends health and security headers", async () => {
    const response = await context.app.inject("/healthz");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-security-policy"]).toContain(
      "default-src 'self'",
    );
    expect(response.headers["x-request-id"]).toBeTruthy();
    expect((await context.app.inject("/readyz")).statusCode).toBe(200);
    expect(
      (
        await post("transactions", transaction(), {
          origin: "https://untrusted.example",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await post("transactions", transaction(), { origin: "invalid" }))
        .statusCode,
    ).toBe(403);
  });
  it("stores native currencies without a rate and changes the default without rewriting history", async () => {
    const saved = await makeTransaction({
      amount: { minorUnits: "10000", currencyCode: "USD" },
    });
    expect(saved.amount?.minorUnits).toBe(10000n);
    expect(saved.baseAmount).toBeUndefined();
    expect(saved.exchangeRate).toBe("");
    expect((await get("exchange-rates")).statusCode).toBe(404);
    expect(
      fromJson(
        p.ReportResponseSchema,
        (await get("reports/monthly?year=2026&currencyCode=EUR")).json(),
      ).totals?.expenses,
    ).toBe(0n);
    expect(
      fromJson(
        p.ReportResponseSchema,
        (await get("reports/monthly?year=2026&currencyCode=USD")).json(),
      ).totals?.expenses,
    ).toBe(10000n);
    const settings = fromJson(p.SettingsSchema, (await get("settings")).json());
    const response = await context.app.inject({
      method: "PATCH",
      url: "/api/v1/settings",
      headers: { "content-type": "application/json" },
      payload: toJsonString(p.SettingsSchema, {
        ...settings,
        language: "en",
        defaultCurrency: "USD",
      }),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(
      fromJson(
        p.ReportResponseSchema,
        (await get("reports/monthly?year=2026")).json(),
      ).totals?.expenses,
    ).toBe(10000n);
    expect(
      fromJson(
        p.TransactionSchema,
        (await get(`transactions/${saved.id}`)).json(),
      ).amount,
    ).toEqual(saved.amount);
  });
  it("creates, archives and restores categories without losing historical entries", async () => {
    const response = await post("categories", {
      name: "Custom category",
      type: 2,
      color: "#123456",
      icon: "●",
      budgetable: true,
    });
    expect(response.statusCode).toBe(201);
    const c = fromJson(p.CategorySchema, response.json());
    const tx = await makeTransaction({ categoryId: c.id });
    expect(
      (
        await context.app.inject({
          method: "DELETE",
          url: `/api/v1/categories/${c.id}`,
          headers: { "if-match": "1" },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await post("transactions", transaction({ categoryId: c.id })))
        .statusCode,
    ).toBe(400);
    expect((await get(`transactions/${tx.id}`)).statusCode).toBe(200);
    await updateCategory(c.id, { archived: false });
    await makeTransaction({ categoryId: c.id });
  });
  it("filters, sorts and pages transactions", async () => {
    await makeTransaction({ counterparty: "Example A", note: "reference" });
    await makeTransaction({
      counterparty: "Example B",
      date: { year: 2026, month: 2, day: 1 },
      amount: { minorUnits: "500", currencyCode: "EUR" },
    });
    for (const filter of [
      "search=reference",
      "startDate=2026-01-01&endDate=2026-01-31",
      "minMinorUnits=1000",
      "maxMinorUnits=1000",
      "counterparty=Example%20A",
    ])
      expect(
        fromJson(
          p.FinanceResponseSchema,
          (await get(`transactions?${filter}`)).json(),
        ).transactions,
      ).toHaveLength(1);
    for (const sort of ["date", "amount", "counterparty", "createdAt"])
      expect(
        fromJson(
          p.FinanceResponseSchema,
          (
            await get(
              `transactions?sort=${sort}&descending=true&pageSize=1&page=2`,
            )
          ).json(),
        ).pagination?.total,
      ).toBe(2);
    expect((await get("transactions?sort=invalid")).statusCode).toBe(400);
    expect((await get("transactions?pageSize=101")).statusCode).toBe(400);
  });
  it("exposes monthly detail separately and includes exactly twelve rows", async () => {
    await updateCategory("groceries", {
      defaultBudget: { minorUnits: "0", currencyCode: "EUR" },
    });
    await makeTransaction();
    await makeTransaction({
      categoryId: "salary",
      type: 1,
      amount: { minorUnits: "20000", currencyCode: "EUR" },
    });
    const report = fromJson(
      p.ReportResponseSchema,
      (await get("reports/monthly?year=2026")).json(),
    );
    expect(report.rows).toHaveLength(12);
    expect(report.totals?.netSavings).toBe(7655n);
    expect(report.totals?.variance).toBe(-12345n);
    const category = fromJson(
      p.ReportResponseSchema,
      (await get("reports/categories?year=2026&month=1")).json(),
    );
    expect(category.rows.some((r) => r.key === "total")).toBe(false);
    expect(category.totals?.income).toBe(20000n);
    expect((await get("reports/dashboard?year=2026")).statusCode).toBe(200);
  });
  it("copies budgets for months and years and stores commitments and scenarios", async () => {
    const b = await post("budgets", {
      categoryId: "groceries",
      startMonth: "2026-01",
      endMonth: "2026-01",
      amount: { minorUnits: "1000", currencyCode: "EUR" },
    });
    expect(b.statusCode, b.body).toBe(201);
    expect(
      (
        await post("budgets/copy", {
          sourceMonth: "2026-01",
          targetMonths: ["2026-02"],
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await post("budgets/copy", { sourceYear: 2026, targetYear: 2027 }))
        .statusCode,
    ).toBe(200);
    const c = await post("recurring-commitments", {
      categoryId: "salary",
      description: "Recurring income",
      amount: { minorUnits: "2000", currencyCode: "EUR" },
      startMonth: "2026-01",
      intervalMonths: 1,
    });
    expect(c.statusCode, c.body).toBe(201);
    const scenario = await post("scenarios", {
      name: "Alternative",
      overrides: [
        {
          month: "2026-03",
          categoryId: "groceries",
          amount: { minorUnits: "500", currencyCode: "EUR" },
        },
      ],
    });
    expect(scenario.statusCode, scenario.body).toBe(201);
    const id = fromJson(p.ScenarioSchema, scenario.json()).id;
    const report = fromJson(
      p.ReportResponseSchema,
      (
        await get(
          `reports/forecast?year=2026&asOfDate=2026-02-01&scenarioId=${id}`,
        )
      ).json(),
    );
    expect(report.rows[2]?.income).toBe(2000n);
    expect(report.rows[2]?.expenses).toBe(500n);
  });
  it("previews and reapplies rules while protecting manual categories", async () => {
    const tx = await makeTransaction({ counterparty: "Example match" });
    const rule = await post("categorization-rules", {
      name: "Generic text rule",
      priority: 1,
      enabled: true,
      counterpartyContains: "match",
      categoryId: "dining",
    });
    expect(rule.statusCode, rule.body).toBe(201);
    expect(
      fromJson(
        p.RulePreviewResponseSchema,
        (
          await post("categorization-rules/preview", {
            transactionIds: [tx.id],
          })
        ).json(),
      ).matches,
    ).toHaveLength(0);
    const preview = await post("categorization-rules/preview", {
      transactionIds: [tx.id],
      overwriteManual: true,
    });
    expect(
      fromJson(p.RulePreviewResponseSchema, preview.json()).matches,
    ).toHaveLength(1);
    await post("categorization-rules/preview", {
      transactionIds: [tx.id],
      overwriteManual: true,
      apply: true,
    });
    expect(
      fromJson(p.TransactionSchema, (await get(`transactions/${tx.id}`)).json())
        .categoryId,
    ).toBe("dining");
    await post("transactions/bulk", {
      transactionIds: [tx.id],
      categoryId: "groceries",
    });
    expect(
      fromJson(p.TransactionSchema, (await get(`transactions/${tx.id}`)).json())
        .categorizationSource,
    ).toBe(p.CategorizationSource.MANUAL);
  });
  it("exports CSV safely and JSON with standard protobuf strings", async () => {
    await makeTransaction({ counterparty: "=formula", note: 'quoted "text"' });
    const csv = await get("export?format=csv");
    expect(csv.body).toContain("'=formula");
    expect(csv.body).toContain('quoted ""text""');
    const json = await get("export?format=json");
    expect(json.body).toContain('"minorUnits":"12345"');
  });
  it.each(["en", "es", "pt-BR"])("persists language %s", async (language) => {
    const settings = fromJson(p.SettingsSchema, (await get("settings")).json());
    const result = await context.app.inject({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      url: "/api/v1/settings",
      payload: JSON.stringify(
        toJson(p.SettingsSchema, { ...settings, language }),
      ),
    });
    expect(result.statusCode).toBe(200);
    expect(
      fromJson(p.SettingsSchema, (await get("settings")).json()).language,
    ).toBe(language);
  });
});
describe("atomic CSV import", () => {
  const csv = (content: string, extra: JsonObject = {}): JsonObject => ({
    filename: "generic.csv",
    source: "generic",
    contentBase64: Buffer.from(content).toString("base64"),
    columns: { date: "date", amount: "amount", counterparty: "description" },
    dateFormat: "yyyy-MM-dd",
    decimalSeparator: ".",
    defaultCurrency: "EUR",
    ...extra,
  });
  it("detects delimiter and headers before mapping", async () => {
    const response = await post(
      "imports",
      csv("date;amount;description\n2026-01-01;-1;Generic", { columns: {} }),
    );
    expect(response.statusCode, response.body).toBe(201);
    const preview = fromJson(p.ImportResponseSchema, response.json());
    expect(preview.delimiter).toBe(";");
    expect(preview.headers).toEqual(["date", "amount", "description"]);
    expect(preview.rows).toHaveLength(0);
  });
  it("imports once, detects repeats and reports duplicates", async () => {
    const request = csv(
      "date,amount,description\n2026-01-01,-12.34,Generic\n2026-01-01,-12.34,Generic",
    );
    const preview = fromJson(
      p.ImportResponseSchema,
      (await post("imports", request)).json(),
    );
    expect(preview.duplicates).toBe(1);
    const first = await post(`imports/${preview.id}/confirm`, {});
    expect(first.statusCode, first.body).toBe(200);
    expect(fromJson(p.ImportResponseSchema, first.json()).imported).toBe(1);
    expect((await post(`imports/${preview.id}/confirm`, {})).body).toBe(
      first.body,
    );
    const second = fromJson(
      p.ImportResponseSchema,
      (await post("imports", request)).json(),
    );
    expect(second.duplicates).toBe(2);
    expect((await get(`imports/${preview.id}`)).statusCode).toBe(200);
  });
  it("rejects all rows atomically if one row is invalid", async () => {
    const preview = fromJson(
      p.ImportResponseSchema,
      (
        await post(
          "imports",
          csv(
            "date,amount,description\n2026-01-01,-12.34,Generic\ninvalid,-4,Bad",
          ),
        )
      ).json(),
    );
    expect(preview.rows[1]?.errors).toContain("INVALID_DATE");
    expect((await post(`imports/${preview.id}/confirm`, {})).statusCode).toBe(
      422,
    );
    expect(
      fromJson(p.FinanceResponseSchema, (await get("transactions")).json())
        .transactions,
    ).toHaveLength(0);
    expect((await get(`imports/${preview.id}/errors`)).body).toContain(
      "INVALID_DATE",
    );
  });
  it("rolls back confirmation when a category was archived after preview", async () => {
    const preview = fromJson(
      p.ImportResponseSchema,
      (
        await post(
          "imports",
          csv(
            "date,amount,description\n2026-01-01,12.34,Generic\n2026-01-02,-4,Generic",
          ),
        )
      ).json(),
    );
    await updateCategory("other-expenses", { archived: true });
    expect((await post(`imports/${preview.id}/confirm`, {})).statusCode).toBe(
      400,
    );
    expect(
      fromJson(p.FinanceResponseSchema, (await get("transactions")).json())
        .transactions,
    ).toHaveLength(0);
  });
  it("normalizes European decimal and date formats", async () => {
    const response = await post(
      "imports",
      csv("date;amount;description\n31/01/2026;-1.234,56;Generic", {
        dateFormat: "dd/MM/yyyy",
        decimalSeparator: ",",
      }),
    );
    const preview = fromJson(p.ImportResponseSchema, response.json());
    expect(preview.rows[0]?.transaction?.amount?.minorUnits).toBe(123456n);
    expect(preview.rows[0]?.transaction?.date?.month).toBe(1);
  });
});

it("returns a retryable error when SQLite is locked by another writer", async () => {
  const { default: Database } = await import("better-sqlite3");
  const writer = new Database(join(directory, "test.db"));
  context.store.sqlite.pragma("busy_timeout = 1");
  writer.exec("BEGIN IMMEDIATE");
  try {
    const response = await post("transactions", transaction());
    expect(response.statusCode, response.body).toBe(503);
    expect(response.body).toContain("DATABASE_BUSY");
  } finally {
    writer.exec("ROLLBACK");
    writer.close();
  }
});
it("rejects malformed CSV without exposing parser internals", async () => {
  const response = await post("imports", {
    source: "generic",
    contentBase64: Buffer.from('date,amount\n"unterminated,1').toString(
      "base64",
    ),
  });
  expect(response.statusCode).toBe(400);
  expect(response.body).toContain("INVALID_FILE");
});
it("keeps native money when editing notes and ignores legacy conversion input", async () => {
  const saved = await makeTransaction({
    amount: { minorUnits: "1000", currencyCode: "USD" },
    exchangeRate: "0.9",
  });
  const response = await context.app.inject({
    method: "PATCH",
    url: `/api/v1/transactions/${saved.id}`,
    headers: { "content-type": "application/json" },
    payload: toJsonString(p.TransactionSchema, {
      ...saved,
      note: "Updated note",
      exchangeRate: "0.5",
    }),
  });
  expect(response.statusCode, response.body).toBe(200);
  const updated = fromJson(p.TransactionSchema, response.json());
  expect(updated.amount).toEqual(saved.amount);
  expect(updated.baseAmount).toBeUndefined();
  expect(updated.exchangeRate).toBe("");
});

it("keeps budgets, forecasts, scenarios and budget copies isolated by currency", async () => {
  await makeTransaction({
    amount: { minorUnits: "1000", currencyCode: "EUR" },
  });
  await makeTransaction({ amount: { minorUnits: "700", currencyCode: "USD" } });
  for (const [currencyCode, minorUnits] of [
    ["EUR", "2000"],
    ["USD", "900"],
  ]) {
    const response = await context.app.inject({
      method: "PUT",
      url: "/api/v1/budgets/2026/01",
      payload: {
        categoryId: "groceries",
        amount: { minorUnits, currencyCode },
      },
    });
    expect(response.statusCode, response.body).toBe(200);
  }
  const commitment = await post("recurring-commitments", {
    categoryId: "groceries",
    description: "Native USD subscription",
    amount: { minorUnits: "200", currencyCode: "USD" },
    startMonth: "2026-01",
    intervalMonths: 1,
    contributesToBudget: true,
  });
  expect(commitment.statusCode, commitment.body).toBe(201);
  const scenario = await post("scenarios", {
    name: "Native USD override",
    overrides: [
      {
        month: "2026-01",
        categoryId: "groceries",
        amount: { minorUnits: "1500", currencyCode: "USD" },
      },
    ],
  });
  expect(scenario.statusCode, scenario.body).toBe(201);
  const scenarioId = fromJson(p.ScenarioSchema, scenario.json()).id;
  const eur = fromJson(
    p.ReportResponseSchema,
    (await get("reports/categories?year=2026&month=1&currencyCode=EUR")).json(),
  );
  const usd = fromJson(
    p.ReportResponseSchema,
    (await get("reports/categories?year=2026&month=1&currencyCode=USD")).json(),
  );
  expect(eur.rows.find((row) => row.key === "groceries")).toMatchObject({
    expenses: 1000n,
    budget: 2000n,
    variance: 1000n,
  });
  expect(usd.rows.find((row) => row.key === "groceries")).toMatchObject({
    expenses: 700n,
    budget: 1100n,
    variance: 400n,
  });
  for (const [currency, expected] of [
    ["EUR", 2000n],
    ["USD", 1500n],
  ] as const) {
    const report = fromJson(
      p.ReportResponseSchema,
      (
        await get(
          `reports/forecast?year=2026&currencyCode=${currency}&asOfDate=2026-01-01&scenarioId=${scenarioId}`,
        )
      ).json(),
    );
    expect(report.rows[0]?.expenses).toBe(expected);
  }
  expect(
    (
      await post("budgets/copy", {
        sourceMonth: "2026-01",
        targetMonths: ["2026-02"],
      })
    ).statusCode,
  ).toBe(200);
  const copied = fromJson(
    p.FinanceResponseSchema,
    (await get("budgets")).json(),
  ).budgets.filter((b) => b.startMonth === "2026-02");
  expect(copied).toHaveLength(2);
  expect(copied.map((b) => b.amount?.currencyCode).sort()).toEqual([
    "EUR",
    "USD",
  ]);
  expect((await get("reports/monthly?currencyCode=XYZ")).statusCode).toBe(400);
});

it("imports and exports original currencies without conversion fields or rates", async () => {
  const preview = await post("imports", {
    source: "native-currencies",
    filename: "native.csv",
    dateFormat: "yyyy-MM-dd",
    decimalSeparator: ".",
    defaultCurrency: "EUR",
    columns: { date: "date", amount: "amount", currency: "currency" },
    contentBase64: Buffer.from(
      "date,amount,currency\n2026-01-01,-12.34,USD\n2026-01-02,-123,JPY\n2026-01-03,-1.234,KWD",
    ).toString("base64"),
  });
  const imported = fromJson(p.ImportResponseSchema, preview.json());
  expect(imported.rows.every((row) => row.errors.length === 0)).toBe(true);
  expect((await post(`imports/${imported.id}/confirm`, {})).statusCode).toBe(
    200,
  );
  const exported = fromJson(
    p.FinanceResponseSchema,
    (await get("export?format=json")).json(),
  );
  expect(
    exported.transactions.map((t) => [
      t.amount?.currencyCode,
      t.amount?.minorUnits,
    ]),
  ).toEqual(
    expect.arrayContaining([
      ["USD", 1234n],
      ["JPY", 123n],
      ["KWD", 1234n],
    ]),
  );
  const csv = (await get("export?format=csv")).body;
  expect(csv).toContain('"1.234","KWD"');
  expect(csv).not.toMatch(/baseAmount|baseCurrency|exchangeRate/);
  const json = (await get("export?format=json")).body;
  expect(json).not.toMatch(/baseAmount|baseCurrency|exchangeRate/);
});
