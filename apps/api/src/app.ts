import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { create, toJson } from "@bufbuild/protobuf";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";

import { FinanceApplication } from "../../../packages/application/src/finance-application.js";
import * as p from "../../../packages/contracts/src/finance/v1/finance_pb.js";
import { createSqliteAdapter } from "../../../packages/database/src/adapter.js";
import * as tables from "../../../packages/database/src/index.js";
import { assert, DomainError } from "../../../packages/domain/src/money.js";
import { registerRoutes } from "./adapters/http/routes.js";
import { csvAdapter } from "./adapters/import/csv.js";
export async function buildApp(
  options: { database?: string; logger?: boolean; webRoot?: string } = {},
) {
  const store = tables.openDatabase(options.database ?? "data/finance.db");
  const finance = new FinanceApplication(
    createSqliteAdapter(store),
    {
      id: randomUUID,
      now: () => new Date().toISOString(),
      hash: (value) => createHash("sha256").update(value).digest("hex"),
    },
    csvAdapter,
  );
  const app = Fastify({
    logger: options.logger
      ? {
          level: "info",
          redact: ["req.headers", "req.body", "res.body"],
          serializers: {
            req: (r: { method: string; url: string }) => ({
              method: r.method,
              path: r.url.split("?")[0],
            }),
          },
        }
      : false,
    bodyLimit: 3_000_000,
    genReqId: () => randomUUID(),
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  await app.register(rateLimit, {
    max: 1200,
    timeWindow: "1 minute",
    allowList: (request) => !request.url.startsWith("/api/"),
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    const origin = request.headers.origin;
    if (origin && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      let host = "";
      try {
        host = new URL(origin).host;
      } catch {
        throw new DomainError("ORIGIN_REJECTED", 403);
      }
      assert(host === request.headers.host, "ORIGIN_REJECTED", 403);
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const code =
      error instanceof DomainError
        ? error.code
        : error instanceof Error &&
            "code" in error &&
            error.code === "SQLITE_BUSY"
          ? "DATABASE_BUSY"
          : "INTERNAL_ERROR";
    const status =
      error instanceof DomainError
        ? error.status
        : code === "DATABASE_BUSY"
          ? 503
          : typeof error === "object" &&
              error !== null &&
              "statusCode" in error &&
              typeof error.statusCode === "number"
            ? error.statusCode
            : 500;
    if (status >= 500)
      request.log.error({ requestId: request.id, code }, "Request failed");
    void reply
      .status(status)
      .type("application/problem+json")
      .send(
        toJson(
          p.ProblemSchema,
          create(p.ProblemSchema, {
            type: `urn:finance:error:${code}`,
            title: code,
            status,
            code:
              status < 500 && code === "INTERNAL_ERROR"
                ? "INVALID_INPUT"
                : code,
            requestId: request.id,
          }),
        ),
      );
  });
  app.addHook("onClose", async () => {
    store.sqlite.close();
  });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => {
    store.sqlite.prepare("SELECT 1").get();
    return { status: "ready" };
  });
  registerRoutes(app, finance);
  const webRoot = options.webRoot ?? resolve("apps/web/dist");
  if (existsSync(webRoot)) {
    await app.register(staticPlugin, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/"))
        return reply
          .code(404)
          .send(
            toJson(
              p.ProblemSchema,
              create(p.ProblemSchema, { code: "NOT_FOUND", status: 404 }),
            ),
          );
      return reply.sendFile("index.html");
    });
  }
  return { app, store };
}
