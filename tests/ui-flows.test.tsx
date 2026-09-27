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
import { type ReactNode } from "react";
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
import { Imports } from "../apps/web/src/features/imports.js";
import { Reports } from "../apps/web/src/features/reports.js";
import { SettingsPage } from "../apps/web/src/features/settings.js";
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
  configure({ asyncUtilTimeout: 500 });
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
function openCreate(resource: Parameters<typeof Configuration>[0]["resource"]) {
  fireEvent.click(document.getElementById(`${resource}-create-button`)!);
}
async function seed() {
  const response = await backend.app.inject({
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
  return JSON.parse(response.body) as { id: string };
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
it("creates a custom category through the real HTTP adapter", async () => {
  show(<Configuration resource="categories" />);
  await screen.findByText("Groceries");
  openCreate("categories");
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
});
it.each([
  "budgets",
  "recurring-commitments",
  "categorization-rules",
  "scenarios",
] as const)(
  "creates %s with accessible forms",
  async (resource) => {
    show(<Configuration resource={resource} />);
    await screen.findByText("Nothing here yet.");
    openCreate(resource);
    const dialog = await screen.findByRole("dialog");
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
    fireEvent.click(scope.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  },
  5_000,
);
it("previews rule application", async () => {
  show(<Configuration resource="categorization-rules" />);
  fireEvent.click(screen.getByText("Preview rule matches"));
  fireEvent.click(screen.getByLabelText("Allow replacing manual categories"));
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  await screen.findByText("Matches: 0");
  fireEvent.click(screen.getByRole("button", { name: "Apply rules" }));
});
it("edits a transaction from the history", async () => {
  const transaction = await seed();
  show(<Transactions />);
  await screen.findByText("Generic entry");
  fireEvent.click(
    document.getElementById(`transaction-row-${transaction.id}`)!,
  );
  fireEvent.click(document.getElementById("transaction-edit-button")!);
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Amount"), {
    target: { value: "15.50" },
  });
  fireEvent.click(document.getElementById("transaction-form-save")!);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await screen.findAllByText("€15.50");
});
it("saves settings and translates the application", async () => {
  show(<SettingsPage />);
  await waitFor(() =>
    expect(document.getElementById("settings-form")).toBeTruthy(),
  );
  fireEvent.click(document.getElementById("settings-section-display")!);
  await waitFor(() =>
    expect(document.getElementById("reportYear")).toBeTruthy(),
  );
  fireEvent.change(document.getElementById("reportYear")!, {
    target: { value: "2027" },
  });
  fireEvent.click(document.getElementById("settings-save-button")!);
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  fireEvent.click(document.getElementById("settings-section-general")!);
  await select("Language", "Español");
  fireEvent.click(document.getElementById("settings-save-button")!);
  await waitFor(() =>
    expect(document.getElementById("settings-save-button")).toHaveTextContent(
      "Guardar",
    ),
  );
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
  expect(document.getElementById("page-overview")).toBeVisible();
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
  const fileInput = document.querySelector("#import-file-upload input");
  expect(fileInput).not.toBeNull();
  if (!fileInput) throw new Error("Upload input missing");
  fireEvent.change(fileInput, {
    target: { files: [file] },
  });
  fireEvent.change(document.getElementById("source")!, {
    target: { value: "generic-test" },
  });
  await waitFor(() =>
    expect(document.getElementById("import-detect")).toBeEnabled(),
  );
  fireEvent.click(document.getElementById("import-detect")!);
  await screen.findByText(/Encoding:/);
  await waitFor(() =>
    expect(document.getElementById("import-preview")).toBeEnabled(),
  );
  fireEvent.click(document.getElementById("import-preview")!);
  await screen.findByText(/Generic CSV entry/);
  await waitFor(() =>
    expect(document.getElementById("import-confirm")).toBeEnabled(),
  );
  fireEvent.click(document.getElementById("import-confirm")!);
  await screen.findByRole(
    "button",
    { name: "Import complete" },
    { timeout: 5000 },
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

it("uses the configured report currency without combining original amounts", async () => {
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
  cleanup();
  const settings = JSON.parse(
    (await backend.app.inject({ method: "GET", url: "/api/v1/settings" })).body,
  ) as Record<string, unknown>;
  const updated = await backend.app.inject({
    method: "PATCH",
    url: "/api/v1/settings",
    payload: { ...settings, language: "en", defaultCurrency: "USD" },
  });
  expect(updated.statusCode, updated.body).toBe(200);
  show(<Reports kind="monthly" />);
  await screen.findByText("USD", {}, { timeout: 3000 });
  await screen.findAllByText("$56.78", {}, { timeout: 3000 });
  expect(screen.queryByText("€12.34")).not.toBeInTheDocument();
});

it("opens the same entry drawer for transactions and categories", async () => {
  show(
    <MemoryRouter initialEntries={["/transactions"]}>
      <App />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(document.getElementById("transaction-create-button")).toBeTruthy(),
  );
  expect(
    screen.queryByLabelText("Amount", { exact: true }),
  ).not.toBeInTheDocument();
  fireEvent.click(document.getElementById("transaction-create-button")!);
  let dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Amount", { exact: true }), {
    target: { value: "12.34" },
  });
  fireEvent.click(document.getElementById("transaction-form-create")!);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  await screen.findAllByText("€12.34");
  fireEvent.click(document.getElementById("nav-group-organization")!);
  fireEvent.click(document.getElementById("nav-link-categories")!);
  await waitFor(() =>
    expect(document.getElementById("categories-create-button")).toBeTruthy(),
  );
  fireEvent.click(document.getElementById("categories-create-button")!);
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
