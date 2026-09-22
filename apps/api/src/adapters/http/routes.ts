import {
  create,
  type DescMessage,
  fromJson,
  type JsonValue,
  type MessageShape,
  toJson,
} from "@bufbuild/protobuf";
import { createValidator } from "@bufbuild/protovalidate";
import type { FastifyInstance, FastifyRequest } from "fastify";

import { FinanceApplication } from "../../../../../packages/application/src/finance-application.js";
import { csvCell } from "../../../../../packages/application/src/imports.js";
import * as p from "../../../../../packages/contracts/src/finance/v1/finance_pb.js";
import { dateString } from "../../../../../packages/domain/src/finance.js";
import {
  assert,
  decimalAmount,
  DomainError,
} from "../../../../../packages/domain/src/money.js";
const validator = createValidator();
export function decode<D extends DescMessage>(
  schema: D,
  value: unknown,
): MessageShape<D> {
  try {
    const message = fromJson(schema, value as JsonValue);
    assert(validator.validate(schema, message).kind === "valid");
    return message;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_INPUT");
  }
}
function param(request: FastifyRequest, key: string): string {
  const params = request.params;
  assert(params && typeof params === "object" && key in params);
  const value: unknown = Reflect.get(params, key);
  assert(typeof value === "string");
  return value;
}
function query(request: FastifyRequest): Record<string, JsonValue> {
  assert(request.query && typeof request.query === "object");
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(request.query)) {
    assert(typeof value === "string");
    result[key] = value;
  }
  return result;
}
export function registerRoutes(
  app: FastifyInstance,
  finance: FinanceApplication,
): void {
  app.get("/api/v1/categories", async () =>
    toJson(
      p.FinanceResponseSchema,
      create(p.FinanceResponseSchema, {
        categories: await finance.list("categories"),
      }),
    ),
  );
  app.get("/api/v1/categories/:id", async (request) =>
    toJson(
      p.CategorySchema,
      await finance.get("categories", param(request, "id")),
    ),
  );
  app.post("/api/v1/categories", async (request, reply) =>
    reply
      .code(201)
      .send(
        toJson(
          p.CategorySchema,
          await finance.save(
            "categories",
            decode(p.CategorySchema, request.body),
          ),
        ),
      ),
  );
  app.patch("/api/v1/categories/:id", async (request) =>
    toJson(
      p.CategorySchema,
      await finance.save(
        "categories",
        decode(p.CategorySchema, request.body),
        param(request, "id"),
      ),
    ),
  );
  app.delete("/api/v1/categories/:id", async (request, reply) => {
    await finance.remove(
      "categories",
      param(request, "id"),
      Number(request.headers["if-match"]),
    );
    return reply.code(204).send();
  });
  app.get("/api/v1/budgets", async () =>
    toJson(
      p.FinanceResponseSchema,
      create(p.FinanceResponseSchema, {
        budgets: await finance.list("budgets"),
      }),
    ),
  );
  app.get("/api/v1/budgets/:id", async (request) =>
    toJson(p.BudgetSchema, await finance.get("budgets", param(request, "id"))),
  );
  app.post("/api/v1/budgets", async (request, reply) =>
    reply
      .code(201)
      .send(
        toJson(
          p.BudgetSchema,
          await finance.save("budgets", decode(p.BudgetSchema, request.body)),
        ),
      ),
  );
  app.patch("/api/v1/budgets/:id", async (request) =>
    toJson(
      p.BudgetSchema,
      await finance.save(
        "budgets",
        decode(p.BudgetSchema, request.body),
        param(request, "id"),
      ),
    ),
  );
  app.delete("/api/v1/budgets/:id", async (request, reply) => {
    await finance.remove(
      "budgets",
      param(request, "id"),
      Number(request.headers["if-match"]),
    );
    return reply.code(204).send();
  });
  app.get("/api/v1/recurring-commitments", async () =>
    toJson(
      p.FinanceResponseSchema,
      create(p.FinanceResponseSchema, {
        commitments: await finance.list("commitments"),
      }),
    ),
  );
  app.get("/api/v1/recurring-commitments/:id", async (request) =>
    toJson(
      p.RecurringCommitmentSchema,
      await finance.get("commitments", param(request, "id")),
    ),
  );
  app.post("/api/v1/recurring-commitments", async (request, reply) =>
    reply
      .code(201)
      .send(
        toJson(
          p.RecurringCommitmentSchema,
          await finance.save(
            "commitments",
            decode(p.RecurringCommitmentSchema, request.body),
          ),
        ),
      ),
  );
  app.patch("/api/v1/recurring-commitments/:id", async (request) =>
    toJson(
      p.RecurringCommitmentSchema,
      await finance.save(
        "commitments",
        decode(p.RecurringCommitmentSchema, request.body),
        param(request, "id"),
      ),
    ),
  );
  app.delete("/api/v1/recurring-commitments/:id", async (request, reply) => {
    await finance.remove(
      "commitments",
      param(request, "id"),
      Number(request.headers["if-match"]),
    );
    return reply.code(204).send();
  });
  app.get("/api/v1/categorization-rules", async () =>
    toJson(
      p.FinanceResponseSchema,
      create(p.FinanceResponseSchema, { rules: await finance.list("rules") }),
    ),
  );
  app.get("/api/v1/categorization-rules/:id", async (request) =>
    toJson(
      p.CategorizationRuleSchema,
      await finance.get("rules", param(request, "id")),
    ),
  );
  app.post("/api/v1/categorization-rules", async (request, reply) =>
    reply
      .code(201)
      .send(
        toJson(
          p.CategorizationRuleSchema,
          await finance.save(
            "rules",
            decode(p.CategorizationRuleSchema, request.body),
          ),
        ),
      ),
  );
  app.patch("/api/v1/categorization-rules/:id", async (request) =>
    toJson(
      p.CategorizationRuleSchema,
      await finance.save(
        "rules",
        decode(p.CategorizationRuleSchema, request.body),
        param(request, "id"),
      ),
    ),
  );
  app.delete("/api/v1/categorization-rules/:id", async (request, reply) => {
    await finance.remove(
      "rules",
      param(request, "id"),
      Number(request.headers["if-match"]),
    );
    return reply.code(204).send();
  });
  app.get("/api/v1/scenarios", async () =>
    toJson(
      p.FinanceResponseSchema,
      create(p.FinanceResponseSchema, {
        scenarios: await finance.list("scenarios"),
      }),
    ),
  );
  app.get("/api/v1/scenarios/:id", async (request) =>
    toJson(
      p.ScenarioSchema,
      await finance.get("scenarios", param(request, "id")),
    ),
  );
  app.post("/api/v1/scenarios", async (request, reply) =>
    reply
      .code(201)
      .send(
        toJson(
          p.ScenarioSchema,
          await finance.save(
            "scenarios",
            decode(p.ScenarioSchema, request.body),
          ),
        ),
      ),
  );
  app.patch("/api/v1/scenarios/:id", async (request) =>
    toJson(
      p.ScenarioSchema,
      await finance.save(
        "scenarios",
        decode(p.ScenarioSchema, request.body),
        param(request, "id"),
      ),
    ),
  );
  app.delete("/api/v1/scenarios/:id", async (request, reply) => {
    await finance.remove(
      "scenarios",
      param(request, "id"),
      Number(request.headers["if-match"]),
    );
    return reply.code(204).send();
  });
  app.get("/api/v1/settings", async () =>
    toJson(p.SettingsSchema, await finance.settings()),
  );
  app.patch("/api/v1/settings", async (request) =>
    toJson(
      p.SettingsSchema,
      await finance.updateSettings(decode(p.SettingsSchema, request.body)),
    ),
  );
  app.get("/api/v1/transactions", async (request) => {
    const q = query(request);
    for (const key of ["page", "pageSize"])
      if (q[key] !== undefined) q[key] = Number(q[key]);
    if (q["descending"] !== undefined)
      q["descending"] = q["descending"] === "true";
    return toJson(
      p.FinanceResponseSchema,
      await finance.transactions(decode(p.ListRequestSchema, q)),
    );
  });
  app.get("/api/v1/transactions/:id", async (request) =>
    toJson(
      p.TransactionSchema,
      await finance.get("transactions", param(request, "id")),
    ),
  );
  app.post("/api/v1/transactions", async (request, reply) => {
    const key = request.headers["idempotency-key"];
    assert(typeof key === "string", "IDEMPOTENCY_REQUIRED");
    return reply
      .code(201)
      .send(
        toJson(
          p.TransactionSchema,
          await finance.createTransaction(
            decode(p.TransactionSchema, request.body),
            key,
          ),
        ),
      );
  });
  app.patch("/api/v1/transactions/:id", async (request) =>
    toJson(
      p.TransactionSchema,
      await finance.updateTransaction(
        param(request, "id"),
        decode(p.TransactionSchema, request.body),
      ),
    ),
  );
  app.delete("/api/v1/transactions/:id", async (request, reply) => {
    await finance.remove(
      "transactions",
      param(request, "id"),
      Number(request.headers["if-match"]),
    );
    return reply.code(204).send();
  });
  app.post("/api/v1/transactions/bulk", async (request) => {
    await finance.recategorize(decode(p.BulkRequestSchema, request.body));
    return {};
  });
  app.post("/api/v1/categorization-rules/preview", async (request) =>
    toJson(
      p.RulePreviewResponseSchema,
      await finance.previewRules(decode(p.BulkRequestSchema, request.body)),
    ),
  );
  app.put("/api/v1/budgets/:year/:month", async (request) =>
    toJson(
      p.BudgetSchema,
      await finance.putBudget(
        param(request, "year"),
        param(request, "month"),
        decode(p.BudgetSchema, request.body),
      ),
    ),
  );
  app.post("/api/v1/budgets/copy", async (request) => {
    await finance.copyBudgets(decode(p.BudgetCopyRequestSchema, request.body));
    return {};
  });
  for (const kind of [
    "dashboard",
    "monthly",
    "categories",
    "forecast",
  ] as const)
    app.get(`/api/v1/reports/${kind}`, async (request) => {
      const q = query(request);
      for (const key of ["year", "month"])
        if (q[key] !== undefined) q[key] = Number(q[key]);
      return toJson(
        p.ReportResponseSchema,
        await finance.report(kind, decode(p.ReportRequestSchema, q)),
      );
    });
  app.post("/api/v1/imports", async (request, reply) =>
    reply
      .code(201)
      .send(
        toJson(
          p.ImportResponseSchema,
          await finance.imports.preview(
            decode(p.ImportRequestSchema, request.body),
          ),
        ),
      ),
  );
  app.get("/api/v1/imports/:id", async (request) =>
    toJson(
      p.ImportResponseSchema,
      await finance.imports.get(param(request, "id")),
    ),
  );
  app.post("/api/v1/imports/:id/confirm", async (request) => {
    assert(
      typeof request.headers["idempotency-key"] === "string",
      "IDEMPOTENCY_REQUIRED",
    );
    return toJson(
      p.ImportResponseSchema,
      await finance.imports.confirm(param(request, "id")),
    );
  });
  app.get("/api/v1/imports/:id/errors", async (request, reply) =>
    reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="import-errors.csv"')
      .send(
        [
          "row,errors",
          ...(await finance.imports.get(param(request, "id"))).rows
            .filter((r) => r.errors.length)
            .map((r) => `${r.rowNumber},${csvCell(r.errors.join(";"))}`),
        ].join("\r\n"),
      ),
  );
  app.get("/api/v1/export", async (request, reply) => {
    const data = await finance.export();
    if (query(request)["format"] === "json")
      return reply
        .header("content-disposition", 'attachment; filename="finance.json"')
        .send(toJson(p.FinanceResponseSchema, data));
    const csv = [
      [
        "date",
        "type",
        "category",
        "amount",
        "currency",
        "counterparty",
        "note",
        "externalId",
        "importSource",
      ],
      ...data.transactions.map((t) => [
        dateString(t.date),
        t.type === p.TransactionType.INCOME ? "income" : "expense",
        t.categoryId,
        decimalAmount(
          t.amount?.minorUnits ?? 0n,
          t.amount?.currencyCode ?? "EUR",
        ),
        t.amount?.currencyCode ?? "",
        t.counterparty,
        t.note,
        t.externalId,
        t.importSource,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    return reply
      .type("text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="transactions.csv"')
      .send(csv);
  });
}
