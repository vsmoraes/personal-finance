import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { create, fromJsonString, toJsonString } from "@bufbuild/protobuf";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import {
  CategorySchema,
  SettingsSchema,
  TransactionType,
} from "../../contracts/src/finance/v1/finance_pb.js";
import * as schema from "./schema.js";
export const categorySlugs = [
  "salary",
  "freelance",
  "investment",
  "refunds",
  "other-income",
  "housing",
  "utilities",
  "phone-internet",
  "groceries",
  "transportation",
  "insurance",
  "healthcare",
  "debt",
  "dining",
  "shopping",
  "entertainment",
  "travel",
  "education",
  "gifts",
  "pets",
  "taxes",
  "other-expenses",
];
export function openDatabase(filename: string) {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)",
  );
  for (const [version, filename] of [
    [1, "0001_initial.sql"],
    [2, "0002_native_currency.sql"],
  ] as const) {
    const migration = readFileSync(
      resolve("packages/database/migrations", filename),
      "utf8",
    );
    const checksum = createHash("sha256").update(migration).digest("hex");
    sqlite
      .transaction(() => {
        const applied = sqlite
          .prepare("SELECT checksum FROM schema_migrations WHERE version = ?")
          .get(version);
        if (!applied) {
          sqlite.exec(migration);
          sqlite
            .prepare("INSERT INTO schema_migrations VALUES (?, ?)")
            .run(version, checksum);
        } else if (
          typeof applied !== "object" ||
          !("checksum" in applied) ||
          applied.checksum !== checksum
        ) {
          throw new Error("MIGRATION_CHECKSUM_MISMATCH");
        }
      })
      .immediate();
  }
  const db = drizzle(sqlite, { schema });
  sqlite
    .transaction(() => {
      if (!db.select().from(schema.settings).get()) {
        const defaults = create(SettingsSchema, {
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
        db.insert(schema.settings)
          .values({
            id: "application",
            payload: toJsonString(SettingsSchema, defaults),
            version: 1,
          })
          .run();
        categorySlugs.forEach((slug, position) => {
          const c = create(CategorySchema, {
            id: slug,
            slug,
            builtin: true,
            type:
              position < 5 ? TransactionType.INCOME : TransactionType.EXPENSE,
            color: position < 5 ? "#176B52" : "#3959A8",
            icon: "●",
            budgetable: true,
            position,
            version: 1,
          });
          db.insert(schema.categories)
            .values({
              id: c.id,
              payload: toJsonString(CategorySchema, c),
              version: 1,
            })
            .run();
        });
      }
    })
    .immediate();
  return {
    db,
    sqlite,
    settings: () => {
      const row = db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.id, "application"))
        .get();
      if (!row) throw new Error("SETTINGS_MISSING");
      return fromJsonString(SettingsSchema, row.payload);
    },
    audit: (entity: string, action: string, entityId: string) =>
      db
        .insert(schema.audit)
        .values({
          id: randomUUID(),
          entity,
          action,
          entityId,
          createdAt: new Date().toISOString(),
        })
        .run(),
  };
}
export type Store = ReturnType<typeof openDatabase>;
export * from "./schema.js";
