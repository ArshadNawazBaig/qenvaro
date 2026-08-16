import type {
  DashboardActivityTone,
  DashboardRange,
  DashboardSalesSummary,
  DashboardTrendPoint,
} from "./schemas";

export const DASHBOARD_ACTIVITY_ACTIONS = [
  "tenant.onboarding.completed",
  "member.invitation.accepted",
  "customer.created",
  "customer.updated",
  "customer.archived",
  "sale.completed",
  "category.created",
  "category.updated",
  "category.archived",
  "tag.created",
  "tag.updated",
  "tag.archived",
  "unit.created",
  "unit.updated",
  "unit.archived",
  "product.created",
  "product.updated",
  "product.archived",
  "product.option_group.created",
  "product.option_group.updated",
  "product.option_group.archived",
  "product.variant.created",
  "product.variant.updated",
  "product.variant.archived",
  "product.image.uploaded",
  "product.image.alt_text_updated",
  "product.image.primary_selected",
  "product.image.reordered",
  "product.image.removed",
  "product.import_created",
  "product.import_updated",
  "product.csv_import.completed",
  "product.csv_export.completed",
  "product.store_availability.updated",
  "inventory.adjusted",
  "inventory.transferred",
  "inventory.low_stock_alerts.updated",
] as const;

const activityTitles: Record<string, string> = {
  "tenant.onboarding.completed": "Workspace setup completed",
  "member.invitation.accepted": "Team invitation accepted",
  "customer.created": "Customer created",
  "customer.updated": "Customer updated",
  "customer.archived": "Customer archived",
  "sale.completed": "Sale completed",
  "category.created": "Category created",
  "category.updated": "Category updated",
  "category.archived": "Category archived",
  "tag.created": "Tag created",
  "tag.updated": "Tag updated",
  "tag.archived": "Tag archived",
  "unit.created": "Unit created",
  "unit.updated": "Unit updated",
  "unit.archived": "Unit archived",
  "product.created": "Product created",
  "product.updated": "Product updated",
  "product.archived": "Product archived",
  "product.option_group.created": "Product option created",
  "product.option_group.updated": "Product option updated",
  "product.option_group.archived": "Product option archived",
  "product.variant.created": "Variant created",
  "product.variant.updated": "Variant updated",
  "product.variant.archived": "Variant archived",
  "product.image.uploaded": "Product image uploaded",
  "product.image.alt_text_updated": "Image description updated",
  "product.image.primary_selected": "Primary image changed",
  "product.image.reordered": "Product images reordered",
  "product.image.removed": "Product image removed",
  "product.import_created": "Product imported",
  "product.import_updated": "Imported product updated",
  "product.csv_import.completed": "Catalog import completed",
  "product.csv_export.completed": "Catalog export completed",
  "product.store_availability.updated": "Store availability updated",
  "inventory.adjusted": "Inventory adjusted",
  "inventory.transferred": "Stock transfer completed",
  "inventory.low_stock_alerts.updated": "Stock alert policy updated",
};

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface ZonedDatePart extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
}

export interface DashboardPeriod {
  days: number;
  label: string;
  start: Date;
  end: Date;
  previousStart: Date;
  dateKeys: string[];
}

function partsInTimezone(date: Date, timezone: string): ZonedDatePart {
  const values = new Map(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get("year") ?? 1970,
    month: values.get("month") ?? 1,
    day: values.get("day") ?? 1,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    second: values.get("second") ?? 0,
  };
}

function shiftCalendarDate(value: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(
    Date.UTC(value.year, value.month - 1, value.day + days),
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function calendarDateToUtc(value: CalendarDate, timezone: string): Date {
  const target = Date.UTC(value.year, value.month - 1, value.day);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = partsInTimezone(new Date(candidate), timezone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    candidate += target - observedAsUtc;
  }
  return new Date(candidate);
}

function dateKey(value: CalendarDate): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

export function dashboardPeriod(
  range: DashboardRange,
  timezone: string,
  now = new Date(),
): DashboardPeriod {
  const days = range === "30d" ? 30 : 7;
  const current = partsInTimezone(now, timezone);
  const today = {
    year: current.year,
    month: current.month,
    day: current.day,
  };
  const first = shiftCalendarDate(today, -(days - 1));
  const tomorrow = shiftCalendarDate(today, 1);
  const previousFirst = shiftCalendarDate(first, -days);
  return {
    days,
    label: `Last ${days} days`,
    start: calendarDateToUtc(first, timezone),
    end: calendarDateToUtc(tomorrow, timezone),
    previousStart: calendarDateToUtc(previousFirst, timezone),
    dateKeys: Array.from({ length: days }, (_, index) =>
      dateKey(shiftCalendarDate(first, index)),
    ),
  };
}

export function dashboardActivityTitle(action: string): string {
  return activityTitles[action] ?? "Workspace updated";
}

export function dashboardActivityTone(action: string): DashboardActivityTone {
  if (
    action.endsWith(".created") ||
    action.endsWith(".uploaded") ||
    action.endsWith(".completed") ||
    action.endsWith(".accepted") ||
    action.endsWith(".transferred")
  )
    return "success";
  if (action.endsWith(".archived") || action.endsWith(".removed"))
    return "warning";
  if (
    action.endsWith(".updated") ||
    action.endsWith(".adjusted") ||
    action.endsWith(".reordered") ||
    action.endsWith(".selected")
  )
    return "primary";
  return "muted";
}

export function completeTrend(
  period: DashboardPeriod,
  rows: Array<{
    date: string;
    netSalesMinor: number;
    grossProfitMinor: number;
    completedSales: number;
    profitRecordCount: number;
  }>,
  locale: string,
  timezone: string,
): DashboardTrendPoint[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const labelFormat = new Intl.DateTimeFormat(locale, {
    month: period.days > 7 ? "numeric" : "short",
    day: "numeric",
    timeZone: timezone,
  });
  return period.dateKeys.map((date) => {
    const row = byDate.get(date);
    const labelInstant = calendarDateToUtc(
      {
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        day: Number(date.slice(8, 10)),
      },
      timezone,
    );
    return {
      date,
      label: labelFormat.format(labelInstant),
      netSalesMinor: row?.netSalesMinor ?? 0,
      grossProfitMinor:
        !row || row.completedSales === row.profitRecordCount
          ? (row?.grossProfitMinor ?? 0)
          : null,
      completedSales: row?.completedSales ?? 0,
    };
  });
}

export function summarizeSales(
  trend: readonly DashboardTrendPoint[],
  previousNetSalesMinor: number,
): DashboardSalesSummary {
  const completedSales = trend.reduce(
    (total, point) => total + point.completedSales,
    0,
  );
  const netSalesMinor = trend.reduce(
    (total, point) => total + point.netSalesMinor,
    0,
  );
  const hasCompleteProfit = trend.every(
    (point) => point.grossProfitMinor !== null,
  );
  const grossProfitMinor = hasCompleteProfit
    ? trend.reduce((total, point) => total + (point.grossProfitMinor ?? 0), 0)
    : null;
  return {
    netSalesMinor,
    grossProfitMinor,
    completedSales,
    averageOrderMinor:
      completedSales === 0 ? 0 : Math.round(netSalesMinor / completedSales),
    marginPercent:
      netSalesMinor === 0 || grossProfitMinor === null
        ? null
        : (grossProfitMinor / netSalesMinor) * 100,
    changePercent:
      previousNetSalesMinor === 0
        ? null
        : ((netSalesMinor - previousNetSalesMinor) / previousNetSalesMinor) *
          100,
  };
}
