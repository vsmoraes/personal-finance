import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { create, toJson } from "@bufbuild/protobuf";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticPlugin from "@fastify/static";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";

import { FinanceApplication } from "../../../packages/application/src/finance-application.js";
import * as p from "../../../packages/contracts/src/finance/v1/finance_pb.js";
import { createSqliteAdapter } from "../../../packages/database/src/adapter.js";
import { sqliteAuth, tursoAuth } from "../../../packages/database/src/auth.js";
import type { DatabaseConfig } from "../../../packages/database/src/config.js";
import * as tables from "../../../packages/database/src/index.js";
import {
  createTursoAdapter,
  openTurso,
} from "../../../packages/database/src/turso.js";
import { assert, DomainError } from "../../../packages/domain/src/money.js";
import { registerRoutes } from "./adapters/http/routes.js";
import { csvAdapter } from "./adapters/import/csv.js";
import { type GoogleVerifier, googleVerifier, registerAuth } from "./auth.js";
export async function buildApp(
  options: {
    database?: string;
    config?: DatabaseConfig;
    logger?: boolean;
    webRoot?: string;
    verifyGoogle?: GoogleVerifier;
    origin?: string;
    clientId?: string;
  } = {},
) {
  const config = options.config ?? {
    driver: "sqlite" as const,
    url: `file:${options.database ?? "data/finance.db"}`,
  };
  const store =
    config.driver === "sqlite"
      ? tables.openDatabase(config.url.replace(/^file:/, ""))
      : await openTurso(config.url, config.authToken);
  const clientId = options.clientId ?? process.env["GOOGLE_CLIENT_ID"];
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is required");
  const production = process.env["NODE_ENV"] === "production";
  const origin = options.origin ?? process.env["APP_ORIGIN"];
  if (
    production &&
    (!origin ||
      (!origin.startsWith("https://") &&
        !["http://localhost:8080", "http://127.0.0.1:8080"].includes(origin)))
  )
    throw new Error("APP_ORIGIN must be an HTTPS origin in production");
  const origins = origin
    ? [new URL(origin).origin]
    : [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
      ];
  if (origins[0] === "http://localhost:8080")
    origins.push("http://127.0.0.1:8080", "http://127.0.0.1:5173");
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
    // Google Identity Services popup must be able to message its opener.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://accounts.google.com"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://accounts.google.com/gsi/style",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://*.googleusercontent.com",
          "https://*.gstatic.com",
        ],
        connectSrc: ["'self'", "https://accounts.google.com"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["https://accounts.google.com"],
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
    if (
      request.url.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method)
    ) {
      assert(
        typeof origin === "string" && origins.includes(origin),
        "ORIGIN_REJECTED",
        403,
      );
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
    if ("sqlite" in store) store.sqlite.close();
    else store.close();
  });
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async () => {
    if ("sqlite" in store) store.sqlite.prepare("SELECT 1").get();
    else await store.client.execute("SELECT 1");
    return { status: "ready" };
  });
  const auth = registerAuth(app, {
    database: "sqlite" in store ? sqliteAuth(store) : tursoAuth(store.client),
    clientId,
    origins,
    secure: origins[0]?.startsWith("https://") ?? false,
    verify: options.verifyGoogle ?? googleVerifier(clientId),
  });
  function finance(request: FastifyRequest) {
    const userId = auth.userId(request);
    return new FinanceApplication(
      "sqlite" in store
        ? createSqliteAdapter(store, userId)
        : createTursoAdapter(store.client, userId),
      {
        id: randomUUID,
        now: () => new Date().toISOString(),
        hash: (value) => createHash("sha256").update(value).digest("hex"),
      },
      csvAdapter,
    );
  }
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
  // The store is exposed for the SQLite-only integration harness. Runtime
  // operations use the driver-neutral FinanceStore above.
  return { app, store: store as ReturnType<typeof tables.openDatabase> };
}
