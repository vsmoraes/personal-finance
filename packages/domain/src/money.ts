import { create } from "@bufbuild/protobuf";

import {
  type Money,
  MoneySchema,
} from "../../contracts/src/finance/v1/finance_pb.js";
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}
export function assert(
  condition: unknown,
  code = "INVALID_INPUT",
  status = 400,
): asserts condition {
  if (!condition) throw new DomainError(code, status);
}
export function digits(currency: string): number {
  assert(
    Intl.supportedValuesOf("currency").includes(currency),
    "INVALID_CURRENCY",
  );
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
export function parseAmount(value: string, currency: string): bigint {
  const precision = digits(currency);
  assert(/^\d+(\.\d+)?$/.test(value), "INVALID_AMOUNT");
  const [whole = "", fraction = ""] = value.split(".");
  assert(fraction.length <= precision, "INVALID_AMOUNT");
  const result =
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, "0") || "0");
  assert(result <= 9223372036854775807n, "INVALID_AMOUNT");
  return result;
}
export function decimalAmount(minor: bigint, currency: string): string {
  const p = digits(currency);
  const value = (minor < 0n ? -minor : minor).toString().padStart(p + 1, "0");
  return `${minor < 0n ? "-" : ""}${p ? `${value.slice(0, -p)}.${value.slice(-p)}` : value}`;
}
export function formatMoney(
  minor: bigint,
  currency: string,
  locale: string,
): string {
  // ECMA-402 accepts exact decimal strings, though TypeScript's Intl declaration still omits them.
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    decimalAmount(minor, currency) as unknown as number,
  );
}
export function money(minorUnits: bigint, currencyCode: string): Money {
  return create(MoneySchema, { minorUnits, currencyCode });
}
