import { fromJsonString } from "@bufbuild/protobuf";
import { expect, test } from "@playwright/test";

import { FinanceResponseSchema } from "../../packages/contracts/src/finance/v1/finance_pb.js";
test.beforeEach(async ({ request }) => {
  const response = await request.get("/api/v1/settings");
  const settings: unknown = await response.json();
  if (typeof settings === "object" && settings !== null)
    await request.patch("/api/v1/settings", {
      data: { ...settings, language: "en" },
    });
});
test("quick entry persists and reports reconcile without overflow", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("12.34");
  const note = `browser-${crypto.randomUUID()}`;
  await page.getByRole("dialog").getByLabel("Note", { exact: true }).fill(note);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(page.getByText("Saved successfully")).toBeVisible();
  const list = await request.get(`/api/v1/transactions?search=${note}`);
  const data: unknown = await list.json();
  expect(JSON.stringify(data)).toContain("1234");
  const report = await request.get("/api/v1/reports/monthly");
  const body: unknown = await report.json();
  expect(
    typeof body === "object" &&
      body !== null &&
      "rows" in body &&
      Array.isArray(body.rows)
      ? body.rows.length
      : 0,
  ).toBe(12);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.goto("/transactions");
  const transactionRow = page.getByRole("row", { name: new RegExp(note) });
  await expect(transactionRow).toBeVisible();
  await transactionRow
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Amount", { exact: true })
    .fill("13.45");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved successfully")).toBeVisible();
  await transactionRow
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  const deleted = await request.get(`/api/v1/transactions?search=${note}`);
  expect(JSON.stringify(await deleted.json())).not.toContain(note);
});
test("every screen fits the viewport and languages switch", async ({
  page,
  request,
}) => {
  for (const path of [
    "/monthly",
    "/category-report",
    "/forecast",
    "/categories",
    "/budgets",
    "/recurring-commitments",
    "/categorization-rules",
    "/scenarios",
    "/imports",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  for (const [language, title] of [
    ["es", "Resumen"],
    ["pt-BR", "Visão geral"],
    ["en", "Overview"],
  ] as const) {
    const response = await request.get("/api/v1/settings");
    const settings: unknown = await response.json();
    if (typeof settings === "object" && settings !== null)
      await request.patch("/api/v1/settings", {
        data: { ...settings, language },
      });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    expect(await page.locator("html").getAttribute("lang")).toBe(language);
  }
});

test("quick entry preserves zero- and three-decimal currencies", async ({
  page,
  request,
}) => {
  for (const [currency, amount, minor] of [
    ["JPY", "123", "123"],
    ["KWD", "1.234", "1234"],
  ] as const) {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .first()
      .click();
    const currencyInput = page.getByRole("dialog").getByRole("combobox", {
      name: "Currency",
      exact: true,
    });
    await currencyInput.fill(currency);
    const option = page
      .locator(".ant-select-item-option-content")
      .filter({ hasText: new RegExp(`^${currency}$`) });
    await expect(option).toBeVisible();
    await option.evaluate((element) => (element as HTMLElement).click());
    await page
      .getByRole("dialog")
      .getByLabel("Amount", { exact: true })
      .fill(amount);
    await expect(page.getByLabel("Exchange rate to base currency")).toHaveCount(
      0,
    );
    const note = `currency-test-${crypto.randomUUID()}`;
    await page
      .getByRole("dialog")
      .getByLabel("Note", { exact: true })
      .fill(note);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add transaction", exact: true })
      .click();
    await expect(page.getByText("Saved successfully")).toBeVisible();
    const response = await request.get(`/api/v1/transactions?search=${note}`);
    const raw = await response.text();
    const data = fromJsonString(FinanceResponseSchema, raw);
    expect(data.transactions[0]?.amount?.minorUnits).toBe(BigInt(minor));
    expect(data.transactions[0]?.amount?.currencyCode).toBe(currency);
    for (const row of data.transactions)
      await request.delete(`/api/v1/transactions/${row.id}`, {
        headers: { "if-match": String(row.version) },
      });
  }
});

test("Overview opens shared category and budget drawers", async ({
  page,
  request,
}) => {
  const name = `drawer-${crypto.randomUUID()}`;
  await page.goto("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Create another entry" }).click();
  await page.getByRole("menuitem", { name: "Categories", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Create another entry" }).click();
  await page.getByRole("menuitem", { name: "Budgets", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Category", exact: true })
    .fill(name);
  const categoryOption = page
    .locator(".ant-select-item-option-content")
    .filter({ hasText: new RegExp(`^${name}$`) });
  await expect(categoryOption).toBeVisible();
  await categoryOption.evaluate((element) => (element as HTMLElement).click());
  await dialog.getByLabel("Amount", { exact: true }).fill("25.00");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const categories = fromJsonString(
    FinanceResponseSchema,
    await (await request.get("/api/v1/categories")).text(),
  ).categories;
  const category = categories.find((c) => c.name === name);
  expect(category).toBeDefined();
  const budgets = fromJsonString(
    FinanceResponseSchema,
    await (await request.get("/api/v1/budgets")).text(),
  ).budgets.filter((b) => b.categoryId === category?.id);
  expect(budgets).toHaveLength(1);
  expect(budgets[0]?.amount?.minorUnits).toBe(2500n);
  for (const budget of budgets)
    await request.delete(`/api/v1/budgets/${budget.id}`, {
      headers: { "if-match": String(budget.version) },
    });
  if (category)
    await request.delete(`/api/v1/categories/${category.id}`, {
      headers: { "if-match": String(category.version) },
    });
});

test("CSV preview and confirmation preserve original currency", async ({
  page,
  request,
}) => {
  const source = `csv-${crypto.randomUUID()}`;
  await page.goto("/imports");
  await page.locator('input[type="file"]').setInputFiles({
    name: "native.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,amount,currency,counterparty\n2026-09-01,-12.34,USD,${source}`,
    ),
  });
  await page.getByLabel("Import source", { exact: true }).fill(source);
  const inspect = page.getByTestId("import-detect");
  await expect(inspect).toBeEnabled({ timeout: 10_000 });
  await inspect.click();
  await expect(page.getByText(/Encoding:/)).toBeVisible();
  const preview = page.getByTestId("import-preview");
  await expect(preview).toBeEnabled({ timeout: 10_000 });
  await preview.click();
  const confirm = page.getByTestId("import-confirm");
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  const [confirmation] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/v1\/imports\/[^/]+\/confirm$/.test(response.url()),
    ),
    confirm.click(),
  ]);
  expect(confirmation.ok()).toBe(true);
  expect(await confirmation.json()).toMatchObject({ status: "confirmed" });
  const entries = fromJsonString(
    FinanceResponseSchema,
    await (await request.get(`/api/v1/transactions?search=${source}`)).text(),
  ).transactions;
  expect(entries).toHaveLength(1);
  expect(entries[0]?.amount).toMatchObject({
    minorUnits: 1234n,
    currencyCode: "USD",
  });
  for (const entry of entries)
    await request.delete(`/api/v1/transactions/${entry.id}`, {
      headers: { "if-match": String(entry.version) },
    });
});
