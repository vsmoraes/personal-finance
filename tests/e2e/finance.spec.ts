import { fromJsonString } from "@bufbuild/protobuf";
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";

import { FinanceResponseSchema } from "../../packages/contracts/src/finance/v1/finance_pb.js";

test.beforeEach(async ({ request, page, baseURL }) => {
  await page.route(
    "https://lh3.googleusercontent.com/e2e-avatar.svg",
    async (route) => {
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="20" fill="#1d7658"/></svg>',
      });
    },
  );
  const origin = new URL(baseURL ?? "http://127.0.0.1:8083").origin;
  const csrf = await request.get("/api/v1/auth/csrf");
  const csrfBody = (await csrf.json()) as { csrfToken: string };
  const login = await request.post("/api/v1/auth/google", {
    headers: { origin, "x-csrf-token": csrfBody.csrfToken },
    data: { credential: "synthetic-e2e-credential" },
  });
  expect(login.ok()).toBe(true);
  const cookies = (await request.storageState()).cookies.filter(
    (cookie) => cookie.name === "finance_session",
  );
  await page.context().addCookies(
    cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      url: origin,
    })),
  );
  const settings: unknown = await (
    await request.get("/api/v1/settings")
  ).json();
  if (typeof settings === "object" && settings !== null)
    await request.patch("/api/v1/settings", {
      headers: { origin },
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

async function expectFrostedModal(page: Page) {
  const surface = page
    .getByRole("dialog")
    .last()
    .locator(":is(.ant-modal-container, .ant-modal-content)");
  await expect(surface).toBeVisible();
  const styles = await surface.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, blur: style.backdropFilter };
  });
  expect(styles.background).toMatch(/(?:\/|,)\s*0\./);
  expect(styles.blur).toContain("blur(");
}

test("the account control expands the top bar downward on hover", async ({
  page,
}) => {
  await page.goto("/");
  const profile = page.locator("#user-profile-button");
  const signOut = page.locator("#sign-out-button");
  await expect(profile).toBeVisible();
  await expect(signOut).toBeHidden();
  const bar = await page.locator(".finance-topbar").boundingBox();
  const photo = await profile.boundingBox();
  expect(bar).not.toBeNull();
  expect(photo).not.toBeNull();
  expect(bar!.x + bar!.width - (photo!.x + photo!.width)).toBeLessThan(30);
  await profile.hover();
  await expect(signOut).toBeVisible();
  await expect(page.locator(".finance-topbar")).toHaveClass(/is-expanded/);
  await expect
    .poll(
      async () => (await page.locator(".finance-topbar").boundingBox())?.height,
    )
    .toBeGreaterThan(bar!.height + 50);
  const expandedBar = await page.locator(".finance-topbar").boundingBox();
  const signOutPosition = await signOut.boundingBox();
  expect(expandedBar!.height).toBeGreaterThan(bar!.height + 50);
  expect(signOutPosition!.y).toBeGreaterThan(photo!.y + photo!.height);
  expect(signOutPosition!.x).toBeGreaterThan(
    expandedBar!.x + expandedBar!.width / 2,
  );
  expect(
    expandedBar!.x +
      expandedBar!.width -
      (signOutPosition!.x + signOutPosition!.width),
  ).toBeLessThan(40);
  await expect(page.locator(".finance-user-menu-details > span")).toHaveText(
    "E2E Tester",
  );
  if ((page.viewportSize()?.width ?? 0) > 800) {
    await page.locator("#nav-group-workspace").hover();
    await expect(signOut).toBeHidden();
    await expect(page.locator("#nav-link-overview")).toBeVisible();
  }
});

test("the login language selector translates the page and persists", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.locator("#login-language-select").click();
  await page
    .locator('.finance-login-language .ant-select-item-option[title="Español"]')
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tus finanzas, con claridad.",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tus finanzas, con claridad.",
  );
});

test("transaction create, filter, edit and delete use stable IDs", async ({
  page,
  request,
}) => {
  const note = `e2e-${crypto.randomUUID()}`;
  await page.goto("/transactions");
  await expect(page.locator("#page-transactions")).toBeVisible();
  await page.locator("#transaction-create-button").click();
  await expectFrostedModal(page);
  await page.locator("#amount").fill("12.34");
  await page.locator("#note").fill(note);
  await page.locator("#transaction-form-create").click();
  const created = fromJsonString(
    FinanceResponseSchema,
    await (await request.get(`/api/v1/transactions?search=${note}`)).text(),
  ).transactions[0];
  expect(created?.amount?.minorUnits).toBe(1234n);
  await page.locator("#transaction-filter-search").fill(note);
  await expect(
    page.locator(
      `#transaction-row-${created?.id} .finance-transaction-icon img`,
    ),
  ).toHaveAttribute("src", "https://lh3.googleusercontent.com/e2e-avatar.svg");
  await page.locator(`#transaction-row-${created?.id}`).click();
  await expect(page.locator(".finance-tx-icon img")).toHaveAttribute(
    "src",
    "https://lh3.googleusercontent.com/e2e-avatar.svg",
  );
  await page.locator("#transaction-edit-button").click();
  await page.locator("#amount").fill("13.45");
  await page.locator("#transaction-form-save").click();
  await page.locator(`#transaction-row-${created?.id}`).click();
  await page.locator("#transaction-delete-button").click();
  await expectFrostedModal(page);
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

test("report bars and lines use distinct accent shades", async ({
  page,
  request,
}) => {
  const prefix = `chart-shades-${crypto.randomUUID()}`;
  const settings = (await (await request.get("/api/v1/settings")).json()) as {
    reportYear?: number;
  };
  try {
    for (let month = 1; month <= 3; month++)
      expect(
        (
          await request.post("/api/v1/transactions", {
            headers: { "idempotency-key": crypto.randomUUID() },
            data: {
              date: { year: settings.reportYear ?? 2026, month, day: 1 },
              type: "TRANSACTION_TYPE_EXPENSE",
              categoryId: "groceries",
              amount: { minorUnits: String(month * 100), currencyCode: "EUR" },
              note: `${prefix}-${month}`,
              includeInBudget: true,
            },
          })
        ).ok(),
      ).toBe(true);
    await page.goto("/monthly");
    await expect(
      page
        .locator("#report-cashflow-chart .recharts-bar-rectangle path")
        .first(),
    ).toBeVisible();
    const barColors = await page
      .locator("#report-cashflow-chart .recharts-bar-rectangle path")
      .evaluateAll((bars) => bars.map((bar) => getComputedStyle(bar).fill));
    const lineColors = await page
      .locator("#report-savings-chart .recharts-line-curve")
      .evaluateAll((lines) =>
        lines.map((line) => getComputedStyle(line).stroke),
      );
    expect(new Set(barColors).size).toBeGreaterThan(2);
    expect(new Set(lineColors).size).toBe(2);
  } finally {
    await removeTransactions(request, prefix);
  }
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
  if (test.info().project.name === "mobile") {
    for (const section of ["appearance", "display", "imports", "general"]) {
      await page.locator("#settings-section-mobile").click();
      await page.locator(`#settings-mobile-option-${section}`).click();
    }
  } else {
    for (const section of ["general", "appearance", "display", "imports"])
      await page.locator(`#settings-section-${section}`).click();
  }
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

test("touch form fields and dropdowns keep a non-zooming font size", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "mobile", "Touch-only behavior");
  const expectReadableSize = async (selector: string) => {
    const size = await page
      .locator(selector)
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      );
    expect(size, selector).toBeGreaterThanOrEqual(16);
  };
  await page.goto("/transactions");
  await expectReadableSize("#transaction-filter-search");
  await expectReadableSize("#transaction-filter-type input");
  await page.locator("#transaction-create-button").click();
  await expectReadableSize("#amount");
  await page.goto("/imports");
  await expectReadableSize("#source");
});

test("desktop navigation, exports, and rule preview actions have ID contracts", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "Desktop-only hover menu");
  await page.goto("/");
  await page.locator("#nav-group-workspace").hover();
  await page.locator("#nav-link-transactions").click();
  await page.locator("#transaction-export-button").click();
  await expect(page.locator("#transaction-export-csv")).toBeVisible();
  await expect(page.locator("#transaction-export-json")).toBeVisible();
  await page.goto("/categorization-rules");
  await page.locator("#rules-preview-toggle").click();
  await page.locator("#rules-overwrite-manual").check();
  await page.locator("#rules-preview-button").click();
  await expect(page.locator("#rules-apply-button")).toBeEnabled();
});
