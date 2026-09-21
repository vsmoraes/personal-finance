import type { Date as FinancialDate } from "../../../../packages/contracts/src/finance/v1/finance_pb.ts";
import { dateString } from "../../../../packages/domain/src/finance.ts";
/** Format a date-only value without shifting it across timezones. */
export function formatDate(
  date: FinancialDate | undefined,
  locale: string,
  pattern: string,
): string {
  const instant = new Date(`${dateString(date)}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).formatToParts(instant);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  if (pattern === "dd/MM/yyyy")
    return `${part("day")}/${part("month")}/${part("year")}`;
  if (pattern === "MM/dd/yyyy")
    return `${part("month")}/${part("day")}/${part("year")}`;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
