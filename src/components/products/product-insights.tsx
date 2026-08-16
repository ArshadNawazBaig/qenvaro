"use client";

import {
  ChartNoAxesColumnIncreasing,
  Eye,
  PieChartIcon,
  TrendingUp,
} from "lucide-react";
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
    <Card>
      <CardHeader>
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
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PendingInsight({
  title,
  description,
  emptyDescription,
  icon: Icon,
}: {
  title: string;
  description: string;
  emptyDescription: string;
  icon: typeof Eye;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-44 sm:h-48">
        <div className="bg-muted/25 relative flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed px-6 text-center">
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_bottom,transparent_calc(25%-1px),var(--border)_25%,transparent_calc(25%+1px),transparent_calc(50%-1px),var(--border)_50%,transparent_calc(50%+1px),transparent_calc(75%-1px),var(--border)_75%,transparent_calc(75%+1px))] opacity-55" />
          <span className="bg-card text-muted-foreground relative flex size-9 items-center justify-center rounded-full border shadow-[var(--shadow-button)]">
            <Icon className="size-4" />
          </span>
          <p className="relative mt-3 text-sm font-medium">Awaiting activity</p>
          <p className="text-muted-foreground relative mt-1 max-w-56 text-xs leading-5">
            {emptyDescription}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProductInsights({
  isDemo,
  catalogTotal,
}: {
  isDemo: boolean;
  catalogTotal: number;
}) {
  if (!isDemo) {
    const emptyDescription =
      catalogTotal === 0
        ? "Add your first product to begin building this view."
        : "Insights will populate from verified tenant activity.";
    return (
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
        <PendingInsight
          title="Product views"
          description="Catalog discovery over the last seven days"
          emptyDescription={emptyDescription}
          icon={Eye}
        />
        <PendingInsight
          title="Product revenue"
          description="Revenue from completed sale line items"
          emptyDescription={emptyDescription}
          icon={ChartNoAxesColumnIncreasing}
        />
        <PendingInsight
          title="Catalog mix"
          description="Products grouped by category"
          emptyDescription={emptyDescription}
          icon={PieChartIcon}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.9fr]">
      <TrendCard mode="views" />
      <TrendCard mode="revenue" />
      <Card>
        <CardHeader>
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
                  isAnimationActive={false}
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
