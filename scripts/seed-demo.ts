/* eslint-disable */
// @ts-nocheck
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { create, toJson } from "@bufbuild/protobuf";
import Database from "better-sqlite3";

import { csvAdapter } from "../apps/api/src/adapters/import/csv.js";
import { FinanceApplication } from "../packages/application/src/finance-application.js";
import {
  ReportRequestSchema,
  ReportResponseSchema,
} from "../packages/contracts/src/finance/v1/finance_pb.js";
import { createSqliteAdapter } from "../packages/database/src/adapter.js";
import { openDatabase } from "../packages/database/src/index.js";
import { DEMO_MARKER, seedDemo } from "./demo/seed.js";

const filename = resolve(
  process.env["DATABASE_URL"]?.replace(/^file:/, "") ?? "data/finance.db",
);
// Online backup includes the WAL and is safe while the application is running.
let backup: string | undefined;
if (existsSync(filename)) {
  const existing = new Database(filename, { readonly: true });
  try {
    const completed = existing
      .prepare("SELECT id FROM idempotency_keys WHERE id = ?")
      .get(DEMO_MARKER);
    if (!completed) {
      backup = `${filename}.before-demo-${new Date().toISOString().replaceAll(":", "-")}.bak`;
      await existing.backup(backup);
    }
  } finally {
    existing.close();
  }
}
const connection = openDatabase(filename);
try {
  const store = createSqliteAdapter(connection);
  const finance = new FinanceApplication(
    store,
    {
      id: randomUUID,
      now: () => new Date().toISOString(),
      hash: (value) => createHash("sha256").update(value).digest("hex"),
    },
    csvAdapter,
  );
  const result = seedDemo(finance, store);
  const counts = Object.fromEntries(
    (
      [
        "transactions",
        "categories",
        "budgets",
        "commitments",
        "rules",
        "scenarios",
      ] as const
    ).map((resource) => [resource, finance.list(resource).length]),
  );
  const reports = [2025, 2026].map((year) => ({
    year,
    report: toJson(
      ReportResponseSchema,
      finance.report("monthly", create(ReportRequestSchema, { year })),
    ),
  }));
  process.stdout.write(
    JSON.stringify(
      {
        status: result.seeded ? "seeded" : "already-seeded",
        database: filename,
        backup,
        counts,
        reports,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  connection.sqlite.close();
}
