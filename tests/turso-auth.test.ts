import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { create } from "@bufbuild/protobuf";
import { expect, it } from "vitest";

import {
  ScenarioSchema,
  TransactionSchema,
  TransactionType,
} from "../packages/contracts/src/finance/v1/finance_pb.js";
import { tursoAuth } from "../packages/database/src/auth.js";
import {
  createTursoAdapter,
  openTurso,
} from "../packages/database/src/turso.js";

it("migrates libSQL, keeps the system profile, and shares attributed records", async () => {
  const directory = mkdtempSync(join(tmpdir(), "finance-libsql-auth-"));
  try {
    const connection = await openTurso(
      `file:${join(directory, "finance.db")}`,
      "",
    );
    try {
      const auth = tursoAuth(connection.client);
      const alice = await auth.findOrCreateUser({
        sub: "alice",
        name: "Alice",
        picture: "https://lh3.googleusercontent.com/alice.png",
      });
      const bob = await auth.findOrCreateUser({ sub: "bob", name: "Bob" });
      const storeAlice = createTursoAdapter(connection.client, alice.id);
      const storeBob = createTursoAdapter(connection.client, bob.id);
      expect(await storeAlice.repositories.categories.list()).toHaveLength(22);
      expect(await storeBob.repositories.categories.list()).toHaveLength(22);
      const scenario = create(ScenarioSchema, {
        id: "shared-scenario",
        name: "Shared",
        version: 1,
      });
      await storeAlice.repositories.scenarios.save(scenario);
      expect(await storeBob.repositories.scenarios.get(scenario.id)).toEqual(
        scenario,
      );
      const transaction = create(TransactionSchema, {
        id: "shared-transaction",
        date: { year: 2026, month: 1, day: 15 },
        type: TransactionType.EXPENSE,
        categoryId: "groceries",
        amount: { minorUnits: 100n, currencyCode: "EUR" },
        version: 1,
      });
      await storeAlice.repositories.transactions.save(transaction);
      expect(
        await storeBob.repositories.transactions.get(transaction.id),
      ).toMatchObject({
        id: transaction.id,
        createdByUserId: alice.id,
        creatorDisplayName: "Alice",
        creatorPictureUrl: "https://lh3.googleusercontent.com/alice.png",
      });
      expect(await storeBob.repositories.transactions.list()).toContainEqual(
        expect.objectContaining({
          id: transaction.id,
          creatorDisplayName: "Alice",
        }),
      );
      const row = await connection.client.execute({
        sql: "SELECT created_by_user_id, created_at FROM scenarios WHERE id = ?",
        args: [scenario.id],
      });
      expect(row.rows[0]?.["created_by_user_id"]).toBe(alice.id);
      expect(typeof row.rows[0]?.["created_at"]).toBe("string");
      const system = await connection.client.execute(
        "SELECT id FROM users WHERE id = 'system'",
      );
      expect(system.rows).toHaveLength(1);
    } finally {
      connection.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
