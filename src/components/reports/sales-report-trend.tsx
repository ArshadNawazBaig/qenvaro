"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SalesReportTrendPoint } from "@/modules/reports/sales-schemas";

function money(
  amountMinor: number,
  currency: string,
  locale: string,
  compact = false,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(amountMinor / 100);
}

export function SalesReportTrend({
  data,
  currency,
  locale,
  rangeLabel,
}: {
  data: SalesReportTrendPoint[];
  currency: string;
  locale: string;
  rangeLabel: string;
}) {
  const hasData = data.some(
    (point) => point.completedSales > 0 || point.completedReturns > 0,
  );
  if (!hasData)
    return (
      <div
        className="flex min-h-80 items-center justify-center px-6 text-center"
        role="status"
      >
        <div className="max-w-sm">
          <p className="text-sm font-semibold">No report activity yet</p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">
            Completed sales and processed returns will appear here for the
            selected period and stores.
          </p>
        </div>
      </div>
    );

  const interval =
    data.length > 60
      ? 14
      : data.length > 30
        ? 8
        : data.length > 14
          ? 4
          : data.length > 7
            ? 2
            : 0;
  return (
    <div className="min-w-0 px-2 pt-5 pb-4 sm:px-4">
      <div className="flex flex-wrap justify-end gap-x-5 gap-y-2 px-3 text-[11px] font-medium">
        <span className="flex items-center gap-2">
          <span className="bg-primary h-0.5 w-4" /> Net sales
        </span>
        <span className="text-muted-foreground flex items-center gap-2">
          <span className="bg-chart-2 h-0.5 w-4 border-t border-dashed" />
          Gross profit
        </span>
        <span className="text-muted-foreground flex items-center gap-2">
          <span className="bg-warning h-2.5 w-2.5 rounded-sm" /> Refunds
        </span>
      </div>
      <div
        className="mt-3 h-72 min-w-0"
        role="img"
        aria-label={`${rangeLabel} net sales, gross profit, and refunds trend.`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              interval={interval}
              minTickGap={14}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={56}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value) =>
                money(Number(value), currency, locale, true)
              }
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                borderColor: "var(--border)",
                background: "var(--popover)",
                boxShadow: "var(--shadow-float)",
                fontSize: 12,
              }}
              formatter={(value, name) => {
                const labels: Record<string, string> = {
                  netSalesMinor: "Net sales",
                  grossProfitMinor: "Gross profit",
                  refundTotalMinor: "Refunds",
                };
                return [
                  value === null || value === undefined
                    ? "Unavailable"
                    : money(Number(value), currency, locale),
                  labels[String(name)] ?? String(name),
                ];
              }}
            />
            <Bar
              dataKey="refundTotalMinor"
              fill="var(--warning)"
              opacity={0.75}
              radius={[3, 3, 0, 0]}
              maxBarSize={10}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="netSalesMinor"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="grossProfitMinor"
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table>
          <caption>{rangeLabel} sales performance</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Gross sales</th>
              <th scope="col">Discounts</th>
              <th scope="col">Returns</th>
              <th scope="col">Net sales</th>
              <th scope="col">Gross profit</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.label}</th>
                <td>{money(point.grossSalesMinor, currency, locale)}</td>
                <td>{money(point.discountMinor, currency, locale)}</td>
                <td>{money(point.refundTotalMinor, currency, locale)}</td>
                <td>{money(point.netSalesMinor, currency, locale)}</td>
                <td>
                  {point.grossProfitMinor === null
                    ? "Unavailable"
                    : money(point.grossProfitMinor, currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
