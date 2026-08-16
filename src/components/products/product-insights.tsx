"use client";

import { Eye, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { productTrend } from "@/modules/products/demo-data";

const mix = [
  { name: "Software", value: 31, color: "var(--chart-1)" },
  { name: "Templates", value: 26, color: "var(--chart-2)" },
  { name: "Services", value: 19, color: "var(--chart-3)" },
  { name: "Hardware", value: 14, color: "var(--chart-4)" },
  { name: "Other", value: 10, color: "var(--muted-foreground)" },
];

function TrendCard({ mode }: { mode: "views" | "revenue" }) {
  const revenue = mode === "revenue";
  const title = revenue ? "Product revenue" : "Product views";
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          {revenue ? (
            <TrendingUp className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
          {title}
        </CardTitle>
        <CardDescription>
          {revenue
            ? "Revenue from visible catalog items"
            : "Catalog discovery over the last seven days"}
        </CardDescription>
      </CardHeader>
      <CardContent
        role="img"
        className="h-44 px-1 pb-1 sm:h-48"
        aria-label={`${title} increased steadily during the last seven days.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={productTrend}
            margin={{ top: 12, right: 8, left: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`fill-${mode}`} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={revenue ? "var(--chart-1)" : "var(--chart-2)"}
                  stopOpacity={0.28}
                />
                <stop
                  offset="100%"
                  stopColor={revenue ? "var(--chart-1)" : "var(--chart-2)"}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickMargin={8}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                borderRadius: 8,
                borderColor: "var(--border)",
                background: "var(--popover)",
                fontSize: 12,
              }}
              formatter={(value) =>
                revenue
                  ? [`$${Number(value).toLocaleString()}`, "Revenue"]
                  : [Number(value).toLocaleString(), "Views"]
              }
            />
            <Area
              type="monotone"
              dataKey={mode}
              stroke={revenue ? "var(--chart-1)" : "var(--chart-2)"}
              strokeWidth={2}
              fill={`url(#fill-${mode})`}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function ProductInsights() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
      <TrendCard mode="views" />
      <TrendCard mode="revenue" />
      <Card>
        <CardHeader className="pb-1">
          <CardTitle>Catalog mix</CardTitle>
          <CardDescription>Products grouped by category</CardDescription>
        </CardHeader>
        <CardContent className="grid min-h-44 grid-cols-[1fr_148px] items-center gap-1">
          <ul className="space-y-2" aria-label="Catalog category mix">
            {mix.map((item) => (
              <li key={item.name} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="text-muted-foreground flex-1">
                  {item.name}
                </span>
                <span className="font-medium">{item.value}%</span>
              </li>
            ))}
          </ul>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={mix}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={38}
                  outerRadius={58}
                  stroke="var(--card)"
                  strokeWidth={3}
                >
                  {mix.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "var(--border)",
                    background: "var(--popover)",
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${String(value)}%`, "Share"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
