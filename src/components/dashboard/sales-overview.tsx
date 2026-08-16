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

const sales = [
  { day: "Mon", net: 18200, profit: 7100 },
  { day: "Tue", net: 22400, profit: 8600 },
  { day: "Wed", net: 19800, profit: 7900 },
  { day: "Thu", net: 26700, profit: 10400 },
  { day: "Fri", net: 29400, profit: 11800 },
  { day: "Sat", net: 33800, profit: 13100 },
  { day: "Sun", net: 31200, profit: 12400 },
];

export function SalesOverview({ hasData }: { hasData: boolean }) {
  if (!hasData) {
    return (
      <div
        className="relative flex h-72 items-center justify-center overflow-hidden px-6 text-center"
        role="region"
        aria-label="Sales performance has no completed transactions in the selected period."
      >
        <div className="pointer-events-none absolute inset-x-6 top-8 bottom-10 [background-image:linear-gradient(to_bottom,transparent_calc(25%-1px),var(--border)_25%,transparent_calc(25%+1px),transparent_calc(50%-1px),var(--border)_50%,transparent_calc(50%+1px),transparent_calc(75%-1px),var(--border)_75%,transparent_calc(75%+1px))] opacity-70" />
        <div className="bg-card relative max-w-sm px-6 py-5">
          <p className="text-sm font-semibold">No completed sales yet</p>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">
            The trend will build automatically after the first completed
            transaction.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-2 pt-7 pb-4 sm:px-4">
      <div className="flex items-center justify-end gap-5 px-3 text-[11px] font-medium">
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
        className="mt-3 h-64"
        role="img"
        aria-label="Net sales rose from 18,200 dollars Monday to 31,200 dollars Sunday."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={sales}
            margin={{ top: 8, right: 18, left: 0, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={44}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickFormatter={(value) => `$${Number(value) / 1000}k`}
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
                `$${Number(value).toLocaleString()}`,
                name === "net" ? "Net sales" : "Gross profit",
              ]}
            />
            <Line
              type="monotone"
              dataKey="net"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
