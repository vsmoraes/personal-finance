import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { fromJsonString } from "@bufbuild/protobuf";

import { TransactionSchema } from "../packages/contracts/src/finance/v1/finance_pb.js";
const dockerPlugin = spawnSync("docker", ["compose", "version"]).status === 0;
const compose = (...args: string[]) =>
  execFileSync(
    dockerPlugin ? "docker" : "docker-compose",
    dockerPlugin ? ["compose", ...args] : args,
    { stdio: "inherit" },
  );
const base = "http://127.0.0.1:8080";
async function ready() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(`${base}/readyz`)).ok) return;
    } catch {
      /* Startup is asynchronous. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Container did not become ready");
}
compose("up", "-d", "--build");
await ready();
const response = await fetch(`${base}/api/v1/transactions`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
  },
  body: JSON.stringify({
    date: { year: 2026, month: 1, day: 1 },
    type: "TRANSACTION_TYPE_EXPENSE",
    categoryId: "groceries",
    amount: { minorUnits: "1", currencyCode: "EUR" },
    note: "Automated persistence smoke test",
    includeInBudget: true,
  }),
});
if (response.status !== 201)
  throw new Error(`Create failed: ${response.status}`);
const saved = fromJsonString(TransactionSchema, await response.text());
for (const args of [["restart"], ["up", "-d", "--force-recreate"]]) {
  compose(...args);
  await ready();
  const restored = await fetch(`${base}/api/v1/transactions/${saved.id}`);
  if (!restored.ok) throw new Error("Persistence verification failed");
  const transaction = fromJsonString(TransactionSchema, await restored.text());
  if (transaction.amount?.minorUnits !== 1n)
    throw new Error("Persisted amount changed");
}
const deleted = await fetch(`${base}/api/v1/transactions/${saved.id}`, {
  method: "DELETE",
  headers: { "if-match": String(saved.version) },
});
if (deleted.status !== 204) throw new Error("Smoke cleanup failed");
process.stdout.write(
  "Docker health, restart, recreation and database persistence verified.\n",
);
