"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const sales = [
  { day: "Mon", net: 18200, profit: 7100 },
  { day: "Tue", net: 22400, profit: 8600 },
  { day: "Wed", net: 19800, profit: 7900 },
  { day: "Thu", net: 26700, profit: 10400 },
  { day: "Fri", net: 29400, profit: 11800 },
  { day: "Sat", net: 33800, profit: 13100 },
  { day: "Sun", net: 31200, profit: 12400 },
];
const stores = [
  { name: "Downtown", amount: 93400 },
  { name: "Riverside", amount: 71600 },
  { name: "Online", amount: 47800 },
];

export function SalesOverview() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Net sales</CardTitle>
              <CardDescription>
                Daily sales and gross-profit estimate
              </CardDescription>
            </div>
            <span className="bg-success/25 text-success-foreground rounded-md px-2 py-1 text-xs font-medium">
              +12.4%
            </span>
          </div>
        </CardHeader>
        <CardContent
          className="h-64 px-1 pb-2"
          aria-label="Net sales rose from 18,200 dollars Monday to 31,200 dollars Sunday."
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={sales}
              margin={{ top: 8, right: 18, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="dashboardSales" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="1"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                width={42}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                tickFormatter={(value) => `$${Number(value) / 1000}k`}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "var(--border)",
                  background: "var(--popover)",
                  fontSize: 12,
                }}
                formatter={(value, name) => [
                  `$${Number(value).toLocaleString()}`,
                  name === "net" ? "Net sales" : "Gross profit",
                ]}
              />
              <Area
                type="monotone"
                dataKey="net"
                stroke="var(--chart-1)"
                fill="url(#dashboardSales)"
                strokeWidth={2.5}
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="var(--chart-2)"
                fill="transparent"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sales by store</CardTitle>
          <CardDescription>Authorized locations in this period</CardDescription>
        </CardHeader>
        <CardContent
          className="h-64 px-1 pb-2"
          aria-label="Downtown store leads sales for the selected period."
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stores}
              layout="vertical"
              margin={{ top: 8, right: 28, left: 20, bottom: 0 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                width={70}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)" }}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: "var(--border)",
                  background: "var(--popover)",
                  fontSize: 12,
                }}
                formatter={(value) => [
                  `$${Number(value).toLocaleString()}`,
                  "Net sales",
                ]}
              />
              <Bar
                dataKey="amount"
                fill="var(--chart-1)"
                radius={[0, 5, 5, 0]}
                barSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
