import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { create, fromJson, toJson } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";

import en from "../apps/web/src/locales/en.json" with { type: "json" };
import es from "../apps/web/src/locales/es.json" with { type: "json" };
import pt from "../apps/web/src/locales/pt-BR.json" with { type: "json" };
import * as p from "../packages/contracts/src/finance/v1/finance_pb.js";
import { categorySlugs } from "../packages/database/src/index.js";
describe("contract and architectural boundaries", () => {
  it("uses standard protobuf JSON including decimal-string int64 values", () => {
    const original = create(p.TransactionSchema, {
      date: { year: 2026, month: 1, day: 2 },
      amount: { minorUnits: 9223372036854775807n, currencyCode: "EUR" },
      type: p.TransactionType.EXPENSE,
    });
    const json = toJson(p.TransactionSchema, original);
    expect(json).toMatchObject({
      amount: { minorUnits: "9223372036854775807" },
      type: "TRANSACTION_TYPE_EXPENSE",
    });
    expect(fromJson(p.TransactionSchema, json)).toEqual(original);
    expect(() => fromJson(p.TransactionSchema, { unknown: true })).toThrow();
  });
  it("has matching complete translation keys and generic category translations", () => {
    function keys(value: object, prefix = ""): string[] {
      return Object.entries(value)
        .flatMap(([key, v]) =>
          typeof v === "object" && v !== null
            ? keys(v as object, `${prefix}${key}.`)
            : [`${prefix}${key}`],
        )
        .sort();
    }
    expect(keys(es)).toEqual(keys(en));
    expect(keys(pt)).toEqual(keys(en));
    expect(Object.keys(en.categories).sort()).toEqual(
      [...categorySlugs].sort(),
    );
  });
  it("keeps domain and application independent from infrastructure and avoids cycles", () => {
    function files(path: string): string[] {
      return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(join(path, entry.name))
          : entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")
            ? [resolve(path, entry.name)]
            : [],
      );
    }
    const sources = [
      ...files("packages/domain/src"),
      ...files("packages/application/src"),
      ...files("packages/database/src"),
      ...files("apps/api/src"),
      ...files("apps/web/src"),
    ];
    const graph = new Map<string, string[]>();
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1] ?? "",
      );
      if (file.includes("/domain/") || file.includes("/application/")) {
        expect(
          imports.some(
            (i) =>
              i.includes("/database/") ||
              i.includes("/apps/") ||
              i.startsWith("node:") ||
              i === "fastify" ||
              i.startsWith("drizzle-orm"),
          ),
        ).toBe(false);
      }
      graph.set(
        file,
        imports
          .filter((i) => i.startsWith("."))
          .map((i) => resolve(file, "..", i.replace(/\.js$/, ".ts"))),
      );
    }
    function visit(file: string, path: Set<string>) {
      expect(path.has(file), `Circular dependency: ${file}`).toBe(false);
      const next = new Set([...path, file]);
      for (const dependency of graph.get(file) ?? [])
        if (graph.has(dependency)) visit(dependency, next);
    }
    for (const file of graph.keys()) visit(file, new Set());
  });
});
