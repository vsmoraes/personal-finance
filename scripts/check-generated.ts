import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
function digest(path: string): string {
  return createHash("sha256")
    .update(
      readdirSync(path, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) =>
          item.isDirectory()
            ? digest(join(path, item.name))
            : item.name + readFileSync(join(path, item.name), "utf8"),
        )
        .join("\n"),
    )
    .digest("hex");
}
const before = digest("packages/contracts/src");
execFileSync("corepack", ["pnpm", "proto:generate"], { stdio: "inherit" });
if (before !== digest("packages/contracts/src"))
  throw new Error("Generated contracts are stale. Run pnpm proto:generate.");
