import type { SalesReportOverview } from "@/modules/reports/sales-schemas";

type MoneyContext = Pick<SalesReportOverview, "currency" | "locale">;
type DateContext = Pick<SalesReportOverview, "locale" | "timezone">;

export function reportMoney(amountMinor: number, report: MoneyContext): string {
  return new Intl.NumberFormat(report.locale, {
    style: "currency",
    currency: report.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function reportCompactMoney(
  amountMinor: number,
  report: MoneyContext,
): string {
  return new Intl.NumberFormat(report.locale, {
    style: "currency",
    currency: report.currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

export function reportDate(value: string, report: DateContext): string {
  return new Intl.DateTimeFormat(report.locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: report.timezone,
  }).format(new Date(value));
}
