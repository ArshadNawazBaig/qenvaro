"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardTrendPoint } from "@/modules/dashboard/schemas";

function compactMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountMinor / 100);
}

function fullMoney(
  amountMinor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function SalesOverview({
  data,
  currency,
  locale,
  rangeLabel,
  canViewSales,
}: {
  data: DashboardTrendPoint[];
  currency: string;
  locale: string;
  rangeLabel: string;
  canViewSales: boolean;
}) {
  if (!canViewSales) {
    return (
      <div
        className="flex min-h-72 items-center justify-center px-6 text-center"
        role="status"
      >
        <div className="max-w-sm">
          <p className="text-sm font-semibold">Sales data is restricted</p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">
            Your workspace role does not include sales or reporting access.
          </p>
        </div>
      </div>
    );
  }

  const hasData = data.some((point) => point.completedSales > 0);
  if (!hasData) {
    return (
      <div
        className="relative flex min-h-72 items-center justify-center overflow-hidden px-6 text-center"
        role="status"
        aria-label={`Sales performance has no completed transactions in the ${rangeLabel.toLowerCase()}.`}
      >
        <div className="pointer-events-none absolute inset-x-6 top-8 bottom-10 [background-image:linear-gradient(to_bottom,transparent_calc(25%-1px),var(--border)_25%,transparent_calc(25%+1px),transparent_calc(50%-1px),var(--border)_50%,transparent_calc(50%+1px),transparent_calc(75%-1px),var(--border)_75%,transparent_calc(75%+1px))] opacity-70" />
        <div className="bg-card relative max-w-sm px-6 py-5">
          <p className="text-sm font-semibold">No completed sales yet</p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">
            This chart will populate automatically after a transaction is
            completed in the selected period.
          </p>
        </div>
      </div>
    );
  }

  const labelStep = data.length > 14 ? 4 : data.length > 7 ? 2 : 0;
  const first = data.find((point) => point.completedSales > 0);
  const last = [...data].reverse().find((point) => point.completedSales > 0);

  return (
    <div className="min-w-0 px-2 pt-7 pb-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 px-3 text-[11px] font-medium">
        <span className="flex items-center gap-2">
          <span className="bg-primary h-0.5 w-4" />
          Net sales
        </span>
        <span className="text-muted-foreground flex items-center gap-2">
          <span className="bg-chart-2 h-0.5 w-4" />
          Gross profit
        </span>
      </div>
      <div
        className="mt-3 h-64 min-w-0"
        role="img"
        aria-label={`${rangeLabel} sales trend. ${first ? `${first.label}: ${fullMoney(first.netSalesMinor, currency, locale)}.` : ""} ${last ? `${last.label}: ${fullMoney(last.netSalesMinor, currency, locale)}.` : ""}`}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
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
              interval={labelStep}
              minTickGap={16}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={52}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value) =>
                compactMoney(Number(value), currency, locale)
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
              formatter={(value, name) => [
                value === null || value === undefined
                  ? "Unavailable"
                  : fullMoney(Number(value), currency, locale),
                name === "netSalesMinor" ? "Net sales" : "Gross profit",
              ]}
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
              activeDot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{rangeLabel} sales trend</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Net sales</th>
            <th scope="col">Gross profit</th>
            <th scope="col">Orders</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.label}</th>
              <td>{fullMoney(point.netSalesMinor, currency, locale)}</td>
              <td>
                {point.grossProfitMinor === null
                  ? "Unavailable"
                  : fullMoney(point.grossProfitMinor, currency, locale)}
              </td>
              <td>{point.completedSales}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
