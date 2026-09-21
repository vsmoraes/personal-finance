import { create } from "@bufbuild/protobuf";

import * as p from "../../contracts/src/finance/v1/finance_pb.js";
import { applyRules, parseDate } from "../../domain/src/finance.js";
import {
  assert,
  DomainError,
  money,
  parseAmount,
} from "../../domain/src/money.js";
import type { FinanceStore, ImportAdapter, Runtime } from "./ports.js";
import { fingerprint, type Service } from "./service.js";
export function importService(
  store: FinanceStore,
  svc: Service,
  runtime: Runtime,
  csvAdapter: ImportAdapter,
) {
  function get(id: string) {
    const row = store.getImport(id);
    assert(row, "NOT_FOUND", 404);
    return row;
  }
  function preview(request: p.ImportRequest): p.ImportResponse {
    assert(
      request.source.trim() && request.source.length <= 100,
      "IMPORT_SOURCE_REQUIRED",
    );
    const decoded = csvAdapter.decode(request);
    const [headers = [], ...records] = decoded.records;
    const result = create(p.ImportResponseSchema, {
      id: runtime.id(),
      status: "preview",
      headers,
      encoding: decoded.encoding,
      delimiter: decoded.delimiter,
      createdAt: runtime.now(),
    });
    const seen = new Set(store.deduplicationKeys());
    if (Object.keys(request.columns).length) {
      for (const key of ["date", "amount"])
        assert(headers.includes(request.columns[key] ?? ""), "INVALID_MAPPING");
      records.forEach((record, index) => {
        const row = create(p.ImportRowSchema, { rowNumber: index + 2 });
        try {
          assert(record.length === headers.length, "COLUMN_COUNT_MISMATCH");
          const cell = (key: string) =>
            record[headers.indexOf(request.columns[key] ?? "")]?.trim() ?? "";
          let date = cell("date");
          if (
            request.dateFormat === "dd/MM/yyyy" ||
            request.dateFormat === "MM/dd/yyyy"
          ) {
            const parts = date.split("/");
            assert(parts.length === 3, "INVALID_DATE");
            const a = parts[0] ?? "";
            const b = parts[1] ?? "";
            date = `${parts[2] ?? ""}-${(request.dateFormat === "dd/MM/yyyy" ? b : a).padStart(2, "0")}-${(request.dateFormat === "dd/MM/yyyy" ? a : b).padStart(2, "0")}`;
          }
          const currency = cell("currency") || request.defaultCurrency;
          let amount = cell("amount");
          if (request.decimalSeparator === ",")
            amount = amount.replaceAll(".", "").replace(",", ".");
          else {
            assert(!amount.includes(","), "INVALID_AMOUNT");
          }
          const negative = amount.startsWith("-");
          if (negative) amount = amount.slice(1);
          const kind = cell("type").toLowerCase();
          assert(!kind || ["income", "expense"].includes(kind), "INVALID_TYPE");
          const type =
            kind === "income"
              ? p.TransactionType.INCOME
              : kind === "expense"
                ? p.TransactionType.EXPENSE
                : negative
                  ? p.TransactionType.EXPENSE
                  : p.TransactionType.INCOME;
          const categoryText = cell("category");
          const category = svc
            .allCategories()
            .find(
              (c) =>
                Boolean(categoryText) &&
                (c.id === categoryText ||
                  c.slug === categoryText ||
                  c.name === categoryText),
            );
          const t = create(p.TransactionSchema, {
            date: parseDate(date),
            type,
            categoryId:
              category?.id ??
              (type === p.TransactionType.INCOME
                ? "other-income"
                : "other-expenses"),
            amount: money(parseAmount(amount, currency), currency),
            counterparty: cell("counterparty"),
            note: cell("note"),
            importSource: request.source,
            externalId: cell("externalId"),
            includeInBudget: true,
          });
          row.transaction = svc.normalizeTransaction(t, undefined, true);
          row.ruleReasons = applyRules(
            {
              ...row.transaction,
              categorizationSource: p.CategorizationSource.IMPORT,
            },
            svc.allRules(),
          ).matches.flatMap((m) => m.reasons);
          const key = fingerprint(row.transaction);
          row.duplicate = seen.has(key);
          seen.add(key);
        } catch (error) {
          row.errors.push(
            error instanceof DomainError ? error.code : "INVALID_ROW",
          );
        }
        result.rows.push(row);
      });
    }
    result.duplicates = result.rows.filter((r) => r.duplicate).length;
    store.atomic(() => {
      store.saveImport(result, request);
      store.audit("import", "preview", result.id);
    });
    return result;
  }
  function confirm(id: string) {
    return store.atomic(() => {
      const result = get(id);
      if (result.status === "confirmed") return result;
      assert(
        result.rows.length > 0 &&
          result.rows.every((r) => r.errors.length === 0),
        "IMPORT_INVALID",
        422,
      );
      const known = new Set(store.deduplicationKeys());
      result.imported = 0;
      result.duplicates = 0;
      for (const row of result.rows) {
        assert(row.transaction);
        const key = fingerprint(row.transaction);
        if (row.duplicate || known.has(key)) {
          result.duplicates++;
          continue;
        }
        svc.category(row.transaction.categoryId, row.transaction.type);
        svc.saveTransaction(row.transaction, undefined, key);
        known.add(key);
        result.imported++;
      }
      result.status = "confirmed";
      store.saveImport(result);
      store.audit("import", "confirm", id);
      return result;
    });
  }
  return { get, preview, confirm };
}
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
