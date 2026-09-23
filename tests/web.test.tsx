// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import "../apps/web/src/i18n.js";

import { create, toJson } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import {
  cumulativeSavings,
  overviewTrendPaths,
} from "../apps/web/src/features/overview-trend-chart.js";
import { TransactionForm } from "../apps/web/src/features/transaction-form.js";
import {
  ApiError,
  categoryName,
  getMessage,
  request,
} from "../apps/web/src/shared/api.js";
import * as p from "../packages/contracts/src/finance/v1/finance_pb.js";
const server = setupServer(
  http.get("/api/v1/settings", () =>
    HttpResponse.json(
      toJson(
        p.SettingsSchema,
        create(p.SettingsSchema, {
          defaultCurrency: "EUR",
          timezone: "UTC",
          language: "en",
        }),
      ),
    ),
  ),
  http.get("/api/v1/categories", () =>
    HttpResponse.json(
      toJson(
        p.FinanceResponseSchema,
        create(p.FinanceResponseSchema, {
          categories: [
            {
              id: "groceries",
              slug: "groceries",
              builtin: true,
              type: p.TransactionType.EXPENSE,
            },
          ],
        }),
      ),
    ),
  ),
  http.post("/api/v1/transactions", async ({ request }) =>
    HttpResponse.json(await request.json(), { status: 201 }),
  ),
);
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
it("submits quick entry using generated contracts and shows success", async () => {
  const onSaved = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AntApp>
        <TransactionForm onSaved={onSaved} />
      </AntApp>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "12.34" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Amount")).toHaveValue("");
});
it("shows translated validation feedback for invalid money", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AntApp>
        <TransactionForm />
      </AntApp>
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("Amount"), {
    target: { value: "invalid" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
});
it("derives the overview trend from monthly net savings", () => {
  const values = cumulativeSavings([
    { netSavings: 120n },
    { netSavings: -20n },
    { netSavings: 80n },
  ] as p.ReportRow[]);
  expect(values).toEqual([120n, 100n, 180n]);
  const first = overviewTrendPaths(values);
  const second = overviewTrendPaths([120n, 100n, 100n]);
  expect(first.line).toContain("M");
  expect(first.area).toContain("Z");
  expect(first.line).not.toBe(second.line);
});
it("maps API problems, network errors, empty deletion responses and category labels", async () => {
  server.use(
    http.get("/api/v1/problem", () =>
      HttpResponse.json({ code: "CONFLICT" }, { status: 409 }),
    ),
    http.get("/api/v1/network", () => HttpResponse.error()),
    http.delete(
      "/api/v1/deletion",
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get("/api/v1/bad", () => HttpResponse.json({}, { status: 500 })),
  );
  await expect(request("problem")).rejects.toEqual(new ApiError("CONFLICT"));
  await expect(request("network")).rejects.toEqual(
    new ApiError("NETWORK_ERROR"),
  );
  await expect(request("bad")).rejects.toEqual(new ApiError("INTERNAL_ERROR"));
  expect(await request("deletion", "DELETE")).toBeNull();
  expect(await getMessage("settings", p.SettingsSchema)).toMatchObject({
    defaultCurrency: "EUR",
  });
  expect(categoryName(undefined, (key) => key)).toBe("unknown");
  expect(
    categoryName(create(p.CategorySchema, { name: "Custom" }), (key) => key),
  ).toBe("Custom");
});
it("formats date-only values with the selected date pattern", async () => {
  const { formatDate } = await import("../apps/web/src/shared/dates.js");
  const date = create(p.DateSchema, { year: 2026, month: 3, day: 2 });
  expect(formatDate(date, "en", "MM/dd/yyyy")).toBe("03/02/2026");
  expect(formatDate(date, "pt-BR", "dd/MM/yyyy")).toBe("02/03/2026");
  expect(formatDate(date, "es", "yyyy-MM-dd")).toBe("2026-03-02");
});
