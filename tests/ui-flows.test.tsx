// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import "../apps/web/src/i18n.js";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { App as AntApp, ConfigProvider } from "antd";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { type ReactNode, useState } from "react";
import { MemoryRouter } from "react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import { buildApp } from "../apps/api/src/app.js";
import { App } from "../apps/web/src/app.js";
import { Configuration } from "../apps/web/src/features/configuration.js";
import {
  type EntryDraft,
  EntryDrawer,
} from "../apps/web/src/features/entry-drawer.js";
import {
  type EntryDraft,
  EntryDrawer,
} from "../apps/web/src/features/entry-drawer.js";
import { Imports } from "../apps/web/src/features/imports.js";
import { Reports } from "../apps/web/src/features/reports.js";
import { SettingsPage } from "../apps/web/src/features/settings.js";
import { TopBar } from "../apps/web/src/features/top-bar.js";
import { Transactions } from "../apps/web/src/features/transactions.js";
import i18n from "../apps/web/src/i18n.js";
import { ErrorNotice, Retry } from "../apps/web/src/shared/ui.js";
let backend: Awaited<ReturnType<typeof buildApp>>;
const server = setupServer(
  http.all("*/api/v1/*", async ({ request }) => {
    const url = new URL(request.url);
    const body = await request.text();
    const method = request.method;
    if (
      method !== "GET" &&
      method !== "POST" &&
      method !== "PATCH" &&
      method !== "DELETE" &&
      method !== "PUT"
    )
      throw new Error("Unsupported test method");
    const response = await backend.app.inject({
      method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers.entries()),
      ...(body ? { payload: body } : {}),
    });
    if (response.statusCode >= 400) process.stderr.write(response.body + "\n");
    return new HttpResponse(
      response.statusCode === 204 ? null : response.body,
      {
        status: response.statusCode,
        headers: {
          "content-type": String(
            response.headers["content-type"] ?? "application/json",
          ),
        },
      },
    );
  }),
);
beforeAll(() => {
  configure({ asyncUtilTimeout: 3000 });
  server.listen({ onUnhandledRequest: "error" });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 992"),
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
beforeEach(async () => {
  backend = await buildApp({ database: ":memory:" });
  await i18n.changeLanguage("en");
});
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  await backend.app.close();
});
afterAll(() => server.close());
function show(node: ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AntApp>{node}</AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}
function ConfigurationWithTopBar({
  resource,
}: {
  resource: Parameters<typeof Configuration>[0]["resource"];
}) {
  const [draft, setDraft] = useState<EntryDraft>();
  return (
    <>
      <TopBar
        currentLabel={resource}
        compact={false}
        onMenu={() => undefined}
        onCreate={setDraft}
      />
      <Configuration resource={resource} />
      <EntryDrawer draft={draft} onClose={() => setDraft(undefined)} />
    </>
  );
}
async function openCreate(
  resource: Parameters<typeof Configuration>[0]["resource"],
) {
  fireEvent.click(screen.getByRole("button", { name: "Create another entry" }));
  const label = {
    categories: "Categories",
    budgets: "Budgets",
    "recurring-commitments": "Recurring commitments",
    "categorization-rules": "Categorization rules",
    scenarios: "What-if plans",
  }[resource];
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
}
async function seed() {
  await backend.app.inject({
    method: "POST",
    url: "/api/v1/transactions",
    headers: { "idempotency-key": "test-transaction" },
    payload: {
      date: { year: new Date().getFullYear(), month: 1, day: 1 },
      type: 2,
      categoryId: "groceries",
      amount: { minorUnits: "1234", currencyCode: "EUR" },
      counterparty: "Generic entry",
      note: "Example note",
      includeInBudget: true,
    },
  });
}
async function select(
  label: string,
  text: string,
  scope: Pick<typeof screen, "getAllByRole"> = screen,
) {
  const boxes = scope.getAllByRole("combobox", { name: label });
  const box = boxes[boxes.length - 1]!;
  fireEvent.mouseDown(box);
  if (box instanceof HTMLInputElement && !box.readOnly)
    fireEvent.change(box, { target: { value: text } });
  await waitFor(() =>
    expect(
      [
        ...document.querySelectorAll(
          ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content",
        ),
      ].some((e) => e.textContent === text),
    ).toBe(true),
  );
  const choice = [
    ...document.querySelectorAll(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content",
    ),
  ].find((e) => e.textContent === text);
  if (choice) fireEvent.click(choice);
}
it.each(["dashboard", "monthly", "categories", "forecast"] as const)(
  "renders %s with detail rows and summaries",
  async (kind) => {
    await seed();
    show(<Reports kind={kind} />);
    await waitFor(() =>
      expect(screen.queryByText("Loading…")).not.toBeInTheDocument(),
    );
    expect(screen.getAllByText("€12.34").length).toBeGreaterThan(0);
    if (kind === "categories") await select("Period", "Jan");
  },
);
it("creates, edits and archives a custom category through real HTTP adapters", async () => {
  show(<ConfigurationWithTopBar resource="categories" />);
  await screen.findByText("Groceries");
  await openCreate("categories");
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), {
    target: { value: "Custom category" },
  });
  fireEvent.change(within(dialog).getByLabelText(/Default monthly budget/), {
    target: { value: "10.00" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await screen.findByText("Custom category");
  const card = screen.getByText("Custom category").closest("tr");
  expect(card).not.toBeNull();
  if (!card) return;
  fireEvent.click(
    within(card as HTMLElement).getByRole("button", { name: "Edit" }),
  );
  const edit = await screen.findByRole("dialog");
  fireEvent.change(within(edit).getByLabelText("Name"), {
    target: { value: "Updated category" },
  });
  fireEvent.click(within(edit).getByRole("button", { name: "Save" }));
  await screen.findByText("Updated category");
  const updated = screen.getByText("Updated category").closest("tr");
  if (!updated) return;
  fireEvent.click(
    within(updated as HTMLElement).getByRole("button", { name: "Archive" }),
  );
  const confirmation = await screen.findByRole("dialog");
  fireEvent.click(
    within(confirmation).getByRole("button", { name: "Archive" }),
  );
  await screen.findByText("Archived");
});
it.each([
  "budgets",
  "recurring-commitments",
  "categorization-rules",
  "scenarios",
] as const)(
  "creates and edits %s with accessible forms",
  async (resource) => {
    show(<ConfigurationWithTopBar resource={resource} />);
    await screen.findByText("Nothing here yet.");
    await openCreate(resource);
    let dialog = await screen.findByRole("dialog");
    const scope = within(dialog);
    if (
      resource === "budgets" ||
      resource === "recurring-commitments" ||
      resource === "categorization-rules"
    )
      await select("Category", "Groceries", scope);
    if (resource === "budgets" || resource === "recurring-commitments")
      fireEvent.change(scope.getByLabelText("Amount"), {
        target: { value: "20.00" },
      });
    if (resource === "recurring-commitments")
      fireEvent.change(scope.getByLabelText("Description"), {
        target: { value: "Monthly commitment" },
      });
    if (resource === "categorization-rules" || resource === "scenarios")
      fireEvent.change(scope.getByLabelText("Name"), {
        target: { value: "Generic configuration" },
      });
    if (resource === "categorization-rules")
      fireEvent.change(scope.getByLabelText("Counterparty contains"), {
        target: { value: "example" },
      });
    if (resource === "scenarios") {
      fireEvent.click(
        scope.getByRole("button", { name: "Add a planned change" }),
      );
      fireEvent.focus(scope.getByLabelText("Month"));
      fireEvent.change(scope.getByLabelText("Month"), {
        target: { value: "2027-01" },
      });
      fireEvent.keyDown(scope.getByLabelText("Month"), {
        key: "Enter",
        code: "Enter",
      });
      fireEvent.blur(scope.getByLabelText("Month"));
      await select("Category", "Groceries", scope);
      fireEvent.change(scope.getByLabelText("Amount"), {
        target: { value: "30.00" },
      });
      fireEvent.click(scope.getByLabelText("Additional"));
    }
    fireEvent.click(scope.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByText("Nothing here yet.");
  },
  30_000,
);
it("previews rule application and copies budgets", async () => {
  show(<Configuration resource="categorization-rules" />);
  fireEvent.click(screen.getByText("Preview rule matches"));
  fireEvent.click(screen.getByLabelText("Allow replacing manual categories"));
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText("Matches: 0");
  fireEvent.click(screen.getByRole("button", { name: "Apply rules" }));
  cleanup();
  show(<Configuration resource="budgets" />);
  fireEvent.click(screen.getByText("Copy budgets"));
  fireEvent.focus(screen.getByLabelText("Source month"));
  fireEvent.change(screen.getByLabelText("Source month"), {
    target: { value: "2026-01" },
  });
  fireEvent.keyDown(screen.getByLabelText("Source month"), {
    key: "Enter",
    code: "Enter",
  });
  fireEvent.blur(screen.getByLabelText("Source month"));
  fireEvent.change(screen.getByLabelText(/Target months/), {
    target: { value: "2026-02" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Copy" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
});
it("edits transaction history, filters and bulk changes category", async () => {
  await seed();
  show(<Transactions />);
  await screen.findByText("Generic entry");
  fireEvent.click(await screen.findByLabelText("Select transaction"));
  await select("Category", "Dining");
  fireEvent.click(screen.getByRole("button", { name: "Change category" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Change category" }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Amount"), {
    target: { value: "15.50" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Delete",
    }),
  );
  await screen.findByText("Nothing here yet.");
});
it("saves settings and translates the application", async () => {
  show(<SettingsPage />);
  fireEvent.click(await screen.findByRole("tab", { name: "Dates & reports" }));
  await screen.findByLabelText("Default reporting year");
  fireEvent.change(screen.getByLabelText("Default reporting year"), {
    target: { value: "2027" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole("tab", { name: "General" }));
  await select("Language", "Español");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("button", { name: "Guardar" });
});
it("renders import controls, application navigation, and recoverable errors", async () => {
  show(<Imports />);
  expect(screen.getByRole("button", { name: "Choose CSV file" })).toBeVisible();
  cleanup();
  show(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "Overview" });
  expect(screen.getByText("Single profile · Private network")).toBeVisible();
  cleanup();
  const retry = vi.fn();
  show(
    <>
      <ErrorNotice error={new Error("invalid")} />
      <Retry onClick={retry} />
    </>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
it("uploads, maps, previews and confirms an atomic CSV import", async () => {
  show(<Imports />);
  const content =
    "date,amount,counterparty\n2026-01-01,-12.34,Generic CSV entry";
  const file = new File([content], "generic.csv", { type: "text/csv" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new TextEncoder().encode(content).buffer),
  });
  const fileInput = document.querySelector("input[type=file]");
  expect(fileInput).not.toBeNull();
  if (!fileInput) throw new Error("Upload input missing");
  fireEvent.change(fileInput, {
    target: { files: [file] },
  });
  fireEvent.change(screen.getByLabelText("Import source"), {
    target: { value: "generic-test" },
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Detect columns" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Detect columns" }));
  await screen.findByText(/Encoding:/);
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText(/Generic CSV entry/);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm import" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm import" }));
  await screen.findByRole(
    "button",
    { name: "Import complete" },
    { timeout: 10000 },
  );
});
it("renders network failures for reports, history, settings and configuration", async () => {
  server.use(http.get("*/api/v1/*", () => HttpResponse.error()));
  for (const component of [
    <Reports key="report" />,
    <Transactions key="history" />,
    <SettingsPage key="settings" />,
    <Configuration key="config" resource="categories" />,
  ]) {
    show(component);
    await screen.findByRole("alert");
    cleanup();
  }
});

it("switches report currencies without combining original amounts", async () => {
  await seed();
  const response = await backend.app.inject({
    method: "POST",
    url: "/api/v1/transactions",
    headers: { "idempotency-key": "native-currency-ui" },
    payload: {
      date: { year: new Date().getFullYear(), month: 1, day: 2 },
      type: 2,
      categoryId: "groceries",
      amount: { minorUnits: "5678", currencyCode: "USD" },
      includeInBudget: true,
    },
  });
  expect(response.statusCode).toBe(201);
  show(<Reports kind="monthly" />);
  await screen.findAllByText("€12.34");
  await select("Report currency", "USD");
  await screen.findAllByText("$56.78");
  expect(screen.queryByText("€12.34")).not.toBeInTheDocument();
});

it("opens the same entry drawer from Overview for transactions and categories", async () => {
  show(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Add transaction" });
  expect(
    screen.queryByLabelText("Amount", { exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
  let dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Amount", { exact: true }), {
    target: { value: "12.34" },
  });
  fireEvent.click(
    within(dialog).getByRole("button", {
      name: "Add transaction",
    }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await screen.findAllByText("€12.34");
  fireEvent.click(screen.getByRole("button", { name: "Create another entry" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Categories" }));
  dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Name"), {
    target: { value: "Overview category" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    (await backend.app.inject({ method: "GET", url: "/api/v1/categories" }))
      .body,
  ).toContain("Overview category");
});
