import { fromJsonString } from "@bufbuild/protobuf";
import { type APIRequestContext, expect, test } from "@playwright/test";

import { FinanceResponseSchema } from "../../packages/contracts/src/finance/v1/finance_pb.js";

test.beforeEach(async ({ request }) => {
  const settings: unknown = await (
    await request.get("/api/v1/settings")
  ).json();
  if (typeof settings === "object" && settings !== null)
    await request.patch("/api/v1/settings", {
      data: { ...settings, language: "en" },
    });
});

async function removeTransactions(request: APIRequestContext, search: string) {
  const rows = fromJsonString(
    FinanceResponseSchema,
    await (await request.get(`/api/v1/transactions?search=${search}`)).text(),
  ).transactions;
  for (const row of rows)
    await request.delete(`/api/v1/transactions/${row.id}`, {
      headers: { "if-match": String(row.version) },
    });
}

test("transaction create, filter, edit and delete use stable IDs", async ({
  page,
  request,
}) => {
  const note = `e2e-${crypto.randomUUID()}`;
  await page.goto("/transactions");
  await expect(page.locator("#page-transactions")).toBeVisible();
  await page.locator("#transaction-create-button").click();
  await page.locator("#amount").fill("12.34");
  await page.locator("#note").fill(note);
  await page.locator("#transaction-form-create").click();
  const created = fromJsonString(
    FinanceResponseSchema,
    await (await request.get(`/api/v1/transactions?search=${note}`)).text(),
  ).transactions[0];
  expect(created?.amount?.minorUnits).toBe(1234n);
  await page.locator("#transaction-filter-search").fill(note);
  await page.locator(`#transaction-row-${created?.id}`).click();
  await page.locator("#transaction-edit-button").click();
  await page.locator("#amount").fill("13.45");
  await page.locator("#transaction-form-save").click();
  await page.locator(`#transaction-row-${created?.id}`).click();
  await page.locator("#transaction-delete-button").click();
  await page.locator("#transaction-delete-confirm").click();
  await expect(page.locator(`#transaction-row-${created?.id}`)).toHaveCount(0);
});

test("transaction filter, sorting and pagination controls are ID-addressable", async ({
  page,
  request,
}) => {
  const prefix = `pagination-${crypto.randomUUID()}`;
  for (let index = 0; index < 21; index++)
    expect(
      (
        await request.post("/api/v1/transactions", {
          headers: { "idempotency-key": crypto.randomUUID() },
          data: {
            date: { year: 2026, month: 1, day: index + 1 },
            type: "TRANSACTION_TYPE_EXPENSE",
            categoryId: "groceries",
            amount: { minorUnits: "100", currencyCode: "EUR" },
            note: `${prefix}-${index}`,
            includeInBudget: true,
          },
        })
      ).ok(),
    ).toBe(true);
  await page.goto("/transactions");
  await page.locator("#transaction-filter-search").fill(prefix);
  await page.locator("#transaction-filter-type").click();
  await page.keyboard.press("Escape");
  await page.locator("#transaction-filter-category").click();
  await page.keyboard.press("Escape");
  await page.locator("#transaction-filter-sort").click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.locator("#transaction-page-2").click();
  await expect(page.locator("#transaction-pagination")).toBeVisible();
  await removeTransactions(request, prefix);
});

test("every route, report filter, and settings section is stable-ID covered", async ({
  page,
}) => {
  const pages = [
    "overview",
    "transactions",
    "imports",
    "budgets",
    "forecast",
    "scenarios",
    "category-report",
    "monthly",
    "categories",
    "recurring-commitments",
    "categorization-rules",
    "settings",
  ];
  for (const name of pages) {
    await page.goto(name === "overview" ? "/" : `/${name}`);
    await expect(page.locator(`#page-${name}`)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      name,
    ).toBe(true);
  }
  for (const [path, ids] of [
    ["/monthly", ["#report-monthly-year"]],
    [
      "/category-report",
      ["#report-categories-year", "#report-categories-month"],
    ],
    ["/forecast", ["#report-forecast-year", "#report-forecast-scenario"]],
  ] as const) {
    await page.goto(path);
    for (const id of ids) {
      await page.locator(id).click();
      await page.keyboard.press("Escape");
    }
  }
  await page.goto("/settings");
  for (const section of ["general", "appearance", "display", "imports"])
    await page.locator(`#settings-section-${section}`).click();
  await page.locator("#settings-save-button").click();
});

test("configuration create and close actions are covered for every resource", async ({
  page,
}) => {
  for (const resource of [
    "categories",
    "budgets",
    "recurring-commitments",
    "categorization-rules",
    "scenarios",
  ]) {
    await page.goto(`/${resource}`);
    await page.locator(`#${resource}-create-button`).click();
    await expect(page.locator("#entry-drawer-close")).toBeVisible();
    await page.locator("#entry-drawer-close").click();
    await page.locator(`#${resource}-search`).fill("no-match");
  }
});

test("every configuration resource supports create, edit, and delete through its drawer", async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID();
  const resources = [
    {
      resource: "categories",
      collection: "categories",
      value: `category-${suffix}`,
      name: "name",
    },
    {
      resource: "budgets",
      collection: "budgets",
      value: "10.00",
      name: "amount",
    },
    {
      resource: "recurring-commitments",
      collection: "commitments",
      value: `commitment-${suffix}`,
      name: "description",
    },
    {
      resource: "categorization-rules",
      collection: "rules",
      value: `rule-${suffix}`,
      name: "name",
    },
    {
      resource: "scenarios",
      collection: "scenarios",
      value: `scenario-${suffix}`,
      name: "name",
    },
  ] as const;
  for (const item of resources) {
    await page.goto(`/${item.resource}`);
    await page.locator(`#${item.resource}-create-button`).click();
    if (
      item.resource === "budgets" ||
      item.resource === "recurring-commitments" ||
      item.resource === "categorization-rules"
    ) {
      await page.locator("#categoryId").fill("Groceries");
      await page.keyboard.press("Enter");
    }
    if (item.resource === "recurring-commitments")
      await page.locator("#amount").fill("10.00");
    await page.locator(`#${item.name}`).fill(item.value);
    await page.locator(`#${item.resource}-form-save`).click();
    const response = await request.get(`/api/v1/${item.resource}`);
    const entity =
      item.resource === "budgets"
        ? fromJsonString(
            FinanceResponseSchema,
            await response.text(),
          ).budgets.find((budget) => budget.amount?.minorUnits === 1000n)
        : ((await response.json()) as Record<string, Array<{ id: string }>>)[
            item.collection
          ]?.find(
            (candidate) =>
              (candidate as Record<string, unknown>)[item.name] === item.value,
          );
    expect(entity?.id, item.resource).toBeTruthy();
    await page.reload();
    if (item.resource !== "budgets")
      await page.locator(`#${item.resource}-search`).fill(item.value);
    await page.locator(`#${item.resource}-row-${entity?.id}`).click();
    await page.locator(`#${item.name}`).fill(item.value);
    await page.locator(`#${item.resource}-form-save`).click();
    if (item.resource !== "budgets")
      await page.locator(`#${item.resource}-search`).fill(item.value);
    await page.locator(`#${item.resource}-row-${entity?.id}`).click();
    await page.locator("#entry-delete-button").click();
    await page.locator(`#${item.resource}-delete-confirm`).click();
  }
});

test("category and budget forms persist through ID based controls", async ({
  page,
  request,
}) => {
  const name = `drawer-${crypto.randomUUID()}`;
  await page.goto("/categories");
  await page.locator("#categories-create-button").click();
  await page.locator("#name").fill(name);
  await page.locator("#categories-form-save").click();
  const category = fromJsonString(
    FinanceResponseSchema,
    await (await request.get("/api/v1/categories")).text(),
  ).categories.find((item) => item.name === name);
  expect(category).toBeDefined();
  await page.goto("/budgets");
  await page.locator("#budgets-create-button").click();
  await page.locator("#categoryId").fill(name);
  await page.keyboard.press("Enter");
  await page.locator("#amount").fill("25.00");
  await page.locator("#budgets-form-save").click();
  const budgets = fromJsonString(
    FinanceResponseSchema,
    await (await request.get("/api/v1/budgets")).text(),
  ).budgets.filter((item) => item.categoryId === category?.id);
  expect(budgets).toHaveLength(1);
  for (const budget of budgets)
    await request.delete(`/api/v1/budgets/${budget.id}`, {
      headers: { "if-match": String(budget.version) },
    });
  if (category)
    await request.delete(`/api/v1/categories/${category.id}`, {
      headers: { "if-match": String(category.version) },
    });
});

test("CSV upload, mapping, preview and confirmation use IDs", async ({
  page,
  request,
}) => {
  const source = `csv-${crypto.randomUUID()}`;
  await page.goto("/imports");
  await page.locator("#import-file-upload input").setInputFiles({
    name: "native.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `date,amount,currency,counterparty\n2026-09-01,-12.34,USD,${source}`,
    ),
  });
  await page.locator("#source").fill(source);
  await page.locator("#import-detect").click();
  await expect(page.locator("#import-preview")).toBeEnabled();
  await page.locator("#import-preview").click();
  await expect(page.locator("#import-confirm")).toBeEnabled();
  await page.locator("#import-confirm").click();
  expect(
    fromJsonString(
      FinanceResponseSchema,
      await (await request.get(`/api/v1/transactions?search=${source}`)).text(),
    ).transactions,
  ).toHaveLength(1);
  await removeTransactions(request, source);
});

test("mobile More sheet exposes destinations by ID", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#mobile-more-button").click();
  await expect(page.locator("#mobile-more-sheet")).toBeVisible();
  await page.locator("#mobile-more-link-settings").click();
  await expect(page.locator("#page-settings")).toBeVisible();
});

test("desktop navigation, exports, budget copy, and rule preview actions have ID contracts", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Desktop-only hover menu");
  await page.goto("/");
  await page.locator("#nav-group-workspace").hover();
  await page.locator("#nav-link-transactions").click();
  await page.locator("#transaction-export-button").click();
  await expect(page.locator("#transaction-export-csv")).toBeVisible();
  await expect(page.locator("#transaction-export-json")).toBeVisible();
  await page.goto("/budgets");
  await page.locator("#budget-copy-toggle").click();
  await expect(page.locator("#budget-copy-submit")).toBeVisible();
  await page.goto("/categorization-rules");
  await page.locator("#rules-preview-toggle").click();
  await page.locator("#rules-overwrite-manual").check();
  await page.locator("#rules-preview-button").click();
  await expect(page.locator("#rules-apply-button")).toBeEnabled();
});
