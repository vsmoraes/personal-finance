/* eslint-disable @typescript-eslint/require-await */
import { randomUUID } from "node:crypto";

import {
  type DescMessage,
  fromJsonString,
  type MessageShape,
  toJsonString,
} from "@bufbuild/protobuf";
import { and, eq } from "drizzle-orm";

import type { FinanceStore, Repository } from "../../application/src/ports.js";
import * as p from "../../contracts/src/finance/v1/finance_pb.js";
import { dateString } from "../../domain/src/finance.js";
import { assert, DomainError } from "../../domain/src/money.js";
import { type Store } from "./index.js";
import * as t from "./schema.js";
const atomicTails = new WeakMap<Store, Promise<void>>();
export function createSqliteAdapter(
  store: Store,
  actorId = "system",
): FinanceStore {
  const scopedId = (id: string) =>
    actorId === "system" ? id : `${actorId}:${id}`;
  function repository<D extends DescMessage>(
    schema: D,
    table:
      | typeof t.categories
      | typeof t.budgets
      | typeof t.transactions
      | typeof t.commitments
      | typeof t.rules
      | typeof t.scenarios,
  ): Repository<MessageShape<D> & { id: string; version: number }> {
    type Entity = MessageShape<D> & { id: string; version: number };
    function deserialize(payload: string): Entity {
      const value = fromJsonString(schema, payload);
      assert(
        "id" in value &&
          typeof value.id === "string" &&
          "version" in value &&
          typeof value.version === "number",
      );
      return value as Entity;
    }
    return {
      list: async () =>
        store.db
          .select()
          .from(table)
          .all()
          .map((row) => deserialize(row.payload)),
      get: async (id) => {
        const row = store.db.select().from(table).where(eq(table.id, id)).get();
        return row ? deserialize(row.payload) : undefined;
      },
      save: async (value, expectedVersion, deduplicationKey) => {
        const fields = {
          id: value.id,
          payload: toJsonString(schema, value),
          version: value.version,
        };
        const metadata = {
          createdByUserId: actorId,
          createdAt: new Date().toISOString(),
        };
        if (table === t.transactions) {
          const transaction = fromJsonString(
            p.TransactionSchema,
            fields.payload,
          );
          const values = {
            ...fields,
            categoryId: transaction.categoryId,
            date: dateString(transaction.date),
            type: transaction.type,
            currency: transaction.amount?.currencyCode ?? "",
            amount: String(transaction.amount?.minorUnits),
            counterparty: transaction.counterparty,
          };
          if (expectedVersion !== undefined) {
            const result = store.db
              .update(t.transactions)
              .set(values)
              .where(
                and(
                  eq(t.transactions.id, value.id),
                  eq(t.transactions.version, expectedVersion),
                ),
              )
              .run();
            assert(result.changes === 1, "CONFLICT", 409);
          } else
            store.db
              .insert(t.transactions)
              .values({
                ...values,
                ...metadata,
                createdAt: transaction.createdAt || metadata.createdAt,
                dedup: deduplicationKey ?? null,
              })
              .run();
        } else if ("categoryId" in table) {
          assert("categoryId" in value && typeof value.categoryId === "string");
          const values = { ...fields, categoryId: value.categoryId };
          if (expectedVersion !== undefined) {
            const result = store.db
              .update(table)
              .set(values)
              .where(
                and(eq(table.id, value.id), eq(table.version, expectedVersion)),
              )
              .run();
            assert(result.changes === 1, "CONFLICT", 409);
          } else
            store.db
              .insert(table)
              .values({ ...values, ...metadata })
              .run();
        } else {
          if (expectedVersion !== undefined) {
            const result = store.db
              .update(table)
              .set(fields)
              .where(
                and(eq(table.id, value.id), eq(table.version, expectedVersion)),
              )
              .run();
            assert(result.changes === 1, "CONFLICT", 409);
          } else
            store.db
              .insert(table)
              .values({ ...fields, ...metadata })
              .run();
        }
      },
      remove: async (id, version) => {
        assert(
          store.db
            .delete(table)
            .where(and(eq(table.id, id), eq(table.version, version)))
            .run().changes === 1,
          "CONFLICT",
          409,
        );
      },
    };
  }
  return {
    repositories: {
      categories: repository(p.CategorySchema, t.categories),
      transactions: repository(p.TransactionSchema, t.transactions),
      budgets: repository(p.BudgetSchema, t.budgets),
      commitments: repository(p.RecurringCommitmentSchema, t.commitments),
      rules: repository(p.CategorizationRuleSchema, t.rules),
      scenarios: repository(p.ScenarioSchema, t.scenarios),
    },
    atomic: async (operation) => {
      const previous = atomicTails.get(store) ?? Promise.resolve();
      let release!: () => void;
      atomicTails.set(
        store,
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );
      await previous;
      try {
        // better-sqlite3 stays on this connection while awaits yield. The
        // queue prevents another request from interleaving its statements.
        store.sqlite.exec("BEGIN IMMEDIATE");
        const value = await operation();
        store.sqlite.exec("COMMIT");
        return value;
      } catch (error) {
        let cause: unknown = error;
        const visited = new Set<unknown>();
        while (cause instanceof Error && !visited.has(cause)) {
          visited.add(cause);
          if (
            "code" in cause &&
            (cause.code === "SQLITE_BUSY" || cause.code === "SQLITE_LOCKED")
          )
            throw new DomainError("DATABASE_BUSY", 503);
          cause = cause.cause;
        }
        try {
          store.sqlite.exec("ROLLBACK");
        } catch {
          // No transaction was opened (for example, BEGIN itself failed).
        }
        throw error;
      } finally {
        release();
      }
    },
    settings: async () => {
      return store.settings();
    },
    audit: async (entity, action, entityId) => {
      store.db
        .insert(t.audit)
        .values({
          id: randomUUID(),
          createdByUserId: actorId,
          entity,
          action,
          entityId,
          createdAt: new Date().toISOString(),
        })
        .run();
    },
    saveSettings: async (settings, version) => {
      assert(
        store.db
          .update(t.settings)
          .set({
            payload: toJsonString(p.SettingsSchema, settings),
            version: settings.version,
          })
          .where(
            and(
              eq(t.settings.id, "application"),
              eq(t.settings.version, version),
            ),
          )
          .run().changes === 1,
        "CONFLICT",
        409,
      );
    },
    deduplicationKeys: async () =>
      store.db
        .select({ key: t.transactions.dedup })
        .from(t.transactions)
        .all()
        .flatMap((row) => (row.key ? [row.key] : [])),
    getIdempotency: async (key) =>
      store.db
        .select({ hash: t.idempotency.hash, payload: t.idempotency.payload })
        .from(t.idempotency)
        .where(eq(t.idempotency.id, scopedId(key)))
        .get(),
    saveIdempotency: async (id, hash, payload) => {
      store.db
        .insert(t.idempotency)
        .values({
          id: scopedId(id),
          createdByUserId: actorId,
          createdAt: new Date().toISOString(),
          hash,
          payload,
        })
        .run();
    },
    getImport: async (id) => {
      const row = store.db
        .select()
        .from(t.imports)
        .where(eq(t.imports.id, id))
        .get();
      return row
        ? fromJsonString(p.ImportResponseSchema, row.payload)
        : undefined;
    },
    saveImport: async (value, request) => {
      const payload = toJsonString(p.ImportResponseSchema, value);
      if (request) {
        store.db
          .insert(t.imports)
          .values({
            id: value.id,
            createdByUserId: actorId,
            createdAtMetadata: value.createdAt,
            payload,
            request: toJsonString(p.ImportRequestSchema, request),
            status: value.status,
            createdAt: value.createdAt,
          })
          .run();
        for (const row of value.rows)
          store.db
            .insert(t.importRows)
            .values({
              id: `${value.id}:${row.rowNumber}`,
              createdByUserId: actorId,
              createdAt: value.createdAt,
              importId: value.id,
              payload: toJsonString(p.ImportRowSchema, row),
            })
            .run();
      } else
        store.db
          .update(t.imports)
          .set({ payload, status: value.status })
          .where(eq(t.imports.id, value.id))
          .run();
    },
  };
}
