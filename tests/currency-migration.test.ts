import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { create, toJsonString } from "@bufbuild/protobuf";
import Database from "better-sqlite3";
import { expect, it } from "vitest";

import * as p from "../packages/contracts/src/finance/v1/finance_pb.js";
import { createSqliteAdapter } from "../packages/database/src/adapter.js";
import { openDatabase } from "../packages/database/src/index.js";

it("migrates conversion-era records without changing original money, identity, or settings", async () => {
  const directory = mkdtempSync(join(tmpdir(), "native-currency-migration-"));
  const filename = join(directory, "finance.db");
  try {
    const legacy = new Database(filename);
    const initial = readFileSync(
      "packages/database/migrations/0001_initial.sql",
      "utf8",
    );
    const transaction = create(p.TransactionSchema, {
      id: "legacy-transaction",
      date: { year: 2026, month: 1, day: 1 },
      categoryId: "groceries",
      type: p.TransactionType.EXPENSE,
      amount: { minorUnits: 1234n, currencyCode: "KWD" },
      baseAmount: { minorUnits: 370n, currencyCode: "EUR" },
      exchangeRate: "3",
      includeInBudget: true,
      version: 4,
    });
    const payload = toJsonString(p.TransactionSchema, transaction);
    legacy.exec(initial);
    legacy.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL)",
    );
    legacy
      .prepare("INSERT INTO schema_migrations VALUES (1, ?)")
      .run(createHash("sha256").update(initial).digest("hex"));
    legacy.prepare("INSERT INTO categories VALUES (?, ?, 1)").run(
      "groceries",
      toJsonString(
        p.CategorySchema,
        create(p.CategorySchema, {
          id: "groceries",
          slug: "groceries",
          type: p.TransactionType.EXPENSE,
          budgetable: true,
          version: 1,
        }),
      ),
    );
    legacy
      .prepare(
        "INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        "legacy-transaction",
        "groceries",
        "2026-01-01",
        2,
        "KWD",
        "1234",
        "370",
        "",
        payload,
        4,
        "existing-dedup",
      );
    legacy
      .prepare("INSERT INTO application_settings VALUES ('application', ?, 7)")
      .run(
        toJsonString(
          p.SettingsSchema,
          create(p.SettingsSchema, {
            baseCurrency: "EUR",
            language: "es",
            timezone: "Europe/Madrid",
            theme: "dark",
            version: 7,
          }),
        ),
      );
    legacy
      .prepare(
        "INSERT INTO idempotency_keys VALUES ('transaction:legacy-key', 'hash', ?)",
      )
      .run(payload);
    legacy
      .prepare("INSERT INTO exchange_rates VALUES ('legacy-rate', '{}', 1)")
      .run();
    const row = create(p.ImportRowSchema, { rowNumber: 2, transaction });
    legacy
      .prepare("INSERT INTO imports VALUES ('preview', ?, ?, 'preview', '')")
      .run(
        toJsonString(
          p.ImportResponseSchema,
          create(p.ImportResponseSchema, { id: "preview", rows: [row] }),
        ),
        '{"exchangeRate":"3","columns":{"exchangeRate":"rate","amount":"amount"}}',
      );
    legacy
      .prepare("INSERT INTO import_rows VALUES ('row', 'preview', ?)")
      .run(toJsonString(p.ImportRowSchema, row));
    legacy.close();

    for (let run = 0; run < 2; run++) {
      const migrated = openDatabase(filename);
      try {
        const store = createSqliteAdapter(migrated);
        const saved =
          await store.repositories.transactions.get("legacy-transaction");
        expect(saved?.amount).toEqual(transaction.amount);
        expect(saved?.version).toBe(4);
        expect(saved?.baseAmount).toBeUndefined();
        expect(saved?.exchangeRate).toBe("");
        expect(await store.settings()).toMatchObject({
          defaultCurrency: "EUR",
          baseCurrency: "",
          language: "es",
          timezone: "Europe/Madrid",
          theme: "dark",
          version: 7,
        });
        expect(await store.deduplicationKeys()).toEqual(["existing-dedup"]);
        expect(
          (await store.getIdempotency("transaction:legacy-key"))?.payload,
        ).not.toMatch(/baseAmount|exchangeRate/);
        expect(
          (await store.getImport("preview"))?.rows[0]?.transaction?.amount,
        ).toEqual(transaction.amount);
        expect(
          (await store.getImport("preview"))?.rows[0]?.transaction?.baseAmount,
        ).toBeUndefined();
        expect(
          migrated.sqlite
            .prepare("SELECT count(*) AS count FROM legacy_exchange_rates")
            .get(),
        ).toEqual({ count: 1 });
        expect(
          migrated.sqlite
            .prepare("SELECT count(*) AS count FROM schema_migrations")
            .get(),
        ).toEqual({ count: 2 });
        expect(
          migrated.sqlite.pragma("integrity_check", { simple: true }),
        ).toBe("ok");
      } finally {
        migrated.sqlite.close();
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
