/* eslint-disable @typescript-eslint/no-base-to-string */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import { type Client, createClient } from "@libsql/client";

import type { FinanceStore, Repository } from "../../application/src/ports.js";
import * as p from "../../contracts/src/finance/v1/finance_pb.js";
import { dateString } from "../../domain/src/finance.js";
import { assert } from "../../domain/src/money.js";
import { categorySlugs } from "./index.js";

type Entity = {
  $typeName: string;
  id: string;
  version: number;
  categoryId?: string;
  amount?: p.Money;
  date?: p.Date;
  type?: number;
  counterparty?: string;
  createdAt?: string;
};
const tables = {
  categories: "categories",
  transactions: "transactions",
  budgets: "budgets",
  commitments: "recurring_commitments",
  rules: "categorization_rules",
  scenarios: "scenarios",
} as const;

export async function openTurso(
  url: string,
  authToken: string,
): Promise<{ client: Client; close(): void }> {
  const client = createClient({ url, authToken });
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)",
  );
  for (const [version, filename] of [
    [1, "0001_initial.sql"],
    [2, "0002_native_currency.sql"],
    [3, "0003_users.sql"],
  ] as const) {
    const migration = readFileSync(
      resolve("packages/database/migrations", filename),
      "utf8",
    );
    const checksum = createHash("sha256").update(migration).digest("hex");
    const applied = await client.execute({
      sql: "SELECT checksum FROM schema_migrations WHERE version = ?",
      args: [version],
    });
    if (!applied.rows.length) {
      const statements = migration
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((sql) => sql.trim())
        .filter(Boolean)
        .map((sql) => ({ sql, args: [] }));
      await client.batch(
        [
          ...statements,
          {
            sql: "INSERT INTO schema_migrations VALUES (?, ?)",
            args: [version, checksum],
          },
        ],
        "write",
      );
    } else if (applied.rows[0]?.["checksum"] !== checksum)
      throw new Error("MIGRATION_CHECKSUM_MISMATCH");
  }
  const existing = await client.execute(
    "SELECT 1 FROM application_settings WHERE id = 'application'",
  );
  if (!existing.rows.length) {
    const settings = create(p.SettingsSchema, {
      language: "",
      defaultCurrency: "EUR",
      timezone: "UTC",
      firstDayOfWeek: 1,
      dateFormat: "yyyy-MM-dd",
      reportYear: new Date().getUTCFullYear(),
      theme: "system",
      customBackground: "#F5F5F5",
      customSurface: "#FFFFFF",
      customAccent: "#1677FF",
      customAccentSecondary: "#69B1FF",
      customSidebarAccent: "#1677FF",
      customSidebarAccentSecondary: "#E6F4FF",
      customMode: "light",
      importCurrency: "EUR",
      importDateFormat: "yyyy-MM-dd",
      importDecimalSeparator: ".",
      version: 1,
    });
    const rows = [
      {
        sql: "INSERT INTO application_settings (id, payload, version, created_at) VALUES (?, ?, ?, ?)",
        args: [
          "application",
          toJsonString(p.SettingsSchema, settings),
          1,
          new Date().toISOString(),
        ],
      },
    ];
    for (const [position, slug] of categorySlugs.entries()) {
      const category = create(p.CategorySchema, {
        id: slug,
        slug,
        builtin: true,
        type:
          position < 5 ? p.TransactionType.INCOME : p.TransactionType.EXPENSE,
        color: position < 5 ? "#176B52" : "#3959A8",
        icon: "●",
        budgetable: true,
        position,
        version: 1,
      });
      rows.push({
        sql: "INSERT INTO categories (id, payload, version, created_at) VALUES (?, ?, ?, ?)",
        args: [
          category.id,
          toJsonString(p.CategorySchema, category),
          1,
          new Date().toISOString(),
        ],
      });
    }
    await client.batch(rows, "write");
  }
  return { client, close: () => client.close() };
}

export function createTursoAdapter(
  client: Client,
  actorId = "system",
): FinanceStore {
  const transactionSelect =
    "SELECT transactions.payload AS payload, transactions.created_by_user_id AS creatorId, users.display_name AS creatorName, users.picture_url AS creatorPicture FROM transactions LEFT JOIN users ON users.id = transactions.created_by_user_id";
  const repo = <T extends Entity>(
    table: string,
    schema: Parameters<typeof fromJsonString>[0],
  ): Repository<T> => ({
    list: async () =>
      table === tables.transactions
        ? (await client.execute(transactionSelect)).rows.map(
            (row) =>
              ({
                ...fromJsonString(schema, String(row["payload"])),
                createdByUserId: String(row["creatorId"]),
                creatorDisplayName: String(row["creatorName"] ?? ""),
                creatorPictureUrl: String(row["creatorPicture"] ?? ""),
              }) as unknown as T,
          )
        : (await client.execute(`SELECT payload FROM ${table}`)).rows.map(
            (row) =>
              fromJsonString(schema, String(row["payload"])) as unknown as T,
          ),
    get: async (id) => {
      if (table === tables.transactions) {
        const row = (
          await client.execute({
            sql: `${transactionSelect} WHERE transactions.id = ?`,
            args: [id],
          })
        ).rows[0];
        return row
          ? ({
              ...fromJsonString(schema, String(row["payload"])),
              createdByUserId: String(row["creatorId"]),
              creatorDisplayName: String(row["creatorName"] ?? ""),
              creatorPictureUrl: String(row["creatorPicture"] ?? ""),
            } as unknown as T)
          : undefined;
      }
      const row = (
        await client.execute({
          sql: `SELECT payload FROM ${table} WHERE id = ?`,
          args: [id],
        })
      ).rows[0];
      return row
        ? (fromJsonString(schema, String(row["payload"])) as unknown as T)
        : undefined;
    },
    save: async (value, expectedVersion, deduplicationKey) => {
      const payload = toJsonString(schema, value);
      const common = [value.id, payload, value.version];
      if (expectedVersion !== undefined) {
        const result = await client.execute({
          sql: `UPDATE ${table} SET payload = ?, version = ? WHERE id = ? AND version = ?`,
          args: [payload, value.version, value.id, expectedVersion],
        });
        assert(result.rowsAffected === 1, "CONFLICT", 409);
        return;
      }
      if (table === "transactions") {
        const tx = value as Entity;
        await client.execute({
          sql: "INSERT INTO transactions (id, category_id, date, type, currency, amount, counterparty, payload, version, dedup, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          args: [
            tx.id,
            tx.categoryId ?? "",
            dateString(tx.date),
            tx.type ?? 0,
            tx.amount?.currencyCode ?? "",
            String(tx.amount?.minorUnits ?? 0n),
            tx.counterparty ?? "",
            payload,
            tx.version,
            deduplicationKey ?? null,
            actorId,
            tx.createdAt ?? new Date().toISOString(),
          ],
        });
      } else if (
        ["budgets", "recurring_commitments", "categorization_rules"].includes(
          table,
        )
      )
        await client.execute({
          sql: `INSERT INTO ${table} (id, category_id, payload, version, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [
            value.id,
            value.categoryId ?? "",
            payload,
            value.version,
            actorId,
            new Date().toISOString(),
          ],
        });
      else
        await client.execute({
          sql: `INSERT INTO ${table} (id, payload, version, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)`,
          args: [...common, actorId, new Date().toISOString()],
        });
    },
    remove: async (id, version) => {
      const result = await client.execute({
        sql: `DELETE FROM ${table} WHERE id = ? AND version = ?`,
        args: [id, version],
      });
      assert(result.rowsAffected === 1, "CONFLICT", 409);
    },
  });
  return {
    repositories: {
      categories: repo(tables.categories, p.CategorySchema),
      transactions: repo(tables.transactions, p.TransactionSchema),
      budgets: repo(tables.budgets, p.BudgetSchema),
      commitments: repo(tables.commitments, p.RecurringCommitmentSchema),
      rules: repo(tables.rules, p.CategorizationRuleSchema),
      scenarios: repo(tables.scenarios, p.ScenarioSchema),
    },
    atomic: async (operation) => operation(),
    settings: async () => {
      const row = (
        await client.execute(
          "SELECT payload FROM application_settings WHERE id = 'application'",
        )
      ).rows[0];
      if (!row) throw new Error("SETTINGS_MISSING");
      return fromJsonString(p.SettingsSchema, String(row["payload"]));
    },
    saveSettings: async (value, expected) => {
      const result = await client.execute({
        sql: "UPDATE application_settings SET payload = ?, version = ? WHERE id = 'application' AND version = ?",
        args: [toJsonString(p.SettingsSchema, value), value.version, expected],
      });
      assert(result.rowsAffected === 1, "CONFLICT", 409);
    },
    audit: async (entity, action, entityId) => {
      await client.execute({
        sql: "INSERT INTO audit_events (id, entity, action, entity_id, created_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)",
        args: [
          randomUUID(),
          entity,
          action,
          entityId,
          new Date().toISOString(),
          actorId,
        ],
      });
    },
    deduplicationKeys: async () =>
      (
        await client.execute(
          "SELECT dedup FROM transactions WHERE dedup IS NOT NULL",
        )
      ).rows.map((row) => String(row["dedup"])),
    getIdempotency: async (id) => {
      const row = (
        await client.execute({
          sql: "SELECT hash, payload FROM idempotency_keys WHERE id = ?",
          args: [actorId === "system" ? id : `${actorId}:${id}`],
        })
      ).rows[0];
      return row
        ? { hash: String(row["hash"]), payload: String(row["payload"]) }
        : undefined;
    },
    saveIdempotency: async (id, hash, payload) => {
      await client.execute({
        sql: "INSERT INTO idempotency_keys (id, hash, payload, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
        args: [
          actorId === "system" ? id : `${actorId}:${id}`,
          hash,
          payload,
          actorId,
          new Date().toISOString(),
        ],
      });
    },
    getImport: async (id) => {
      const row = (
        await client.execute({
          sql: "SELECT payload FROM imports WHERE id = ?",
          args: [id],
        })
      ).rows[0];
      return row
        ? fromJsonString(p.ImportResponseSchema, String(row["payload"]))
        : undefined;
    },
    saveImport: async (value, request) => {
      const payload = toJsonString(p.ImportResponseSchema, value);
      if (request) {
        await client.execute({
          sql: "INSERT INTO imports (id, payload, request, status, created_at, created_by_user_id, created_at_metadata) VALUES (?, ?, ?, ?, ?, ?, ?)",
          args: [
            value.id,
            payload,
            toJsonString(p.ImportRequestSchema, request),
            value.status,
            value.createdAt,
            actorId,
            value.createdAt,
          ],
        });
        for (const row of value.rows)
          await client.execute({
            sql: "INSERT INTO import_rows (id, import_id, payload, created_by_user_id, created_at) VALUES (?, ?, ?, ?, ?)",
            args: [
              `${value.id}:${row.rowNumber}`,
              value.id,
              toJsonString(p.ImportRowSchema, row),
              actorId,
              value.createdAt,
            ],
          });
      } else
        await client.execute({
          sql: "UPDATE imports SET payload = ?, status = ? WHERE id = ?",
          args: [payload, value.status, value.id],
        });
    },
  };
}
