import { execFileSync, spawnSync } from "node:child_process";

import Database from "better-sqlite3";

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
function databaseState() {
  const db = new Database("data/finance.db", { readonly: true });
  try {
    const system = db
      .prepare("SELECT count(*) AS n FROM users WHERE id = 'system'")
      .get() as { n: number };
    const transactions = db
      .prepare("SELECT count(*) AS n FROM transactions")
      .get() as { n: number };
    return { system: system.n, transactions: transactions.n };
  } finally {
    db.close();
  }
}
async function protectedApi() {
  const response = await fetch(`${base}/api/v1/transactions`);
  if (response.status !== 401)
    throw new Error(`Unauthenticated API returned ${response.status}`);
}
compose("up", "-d", "--build");
await ready();
await protectedApi();
const before = databaseState();
if (before.system !== 1) throw new Error("System user missing");
for (const args of [["restart"], ["up", "-d", "--force-recreate"]]) {
  compose(...args);
  await ready();
  await protectedApi();
  const after = databaseState();
  if (
    after.system !== before.system ||
    after.transactions !== before.transactions
  )
    throw new Error("Docker persistence verification failed");
}
process.stdout.write(
  "Docker authentication gate, restart, recreation and database persistence verified.\n",
);
