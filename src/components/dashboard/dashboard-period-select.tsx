"use client";

import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardRange } from "@/modules/dashboard/schemas";

const dashboardPeriods = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "120d", label: "Last 120 days" },
] as const satisfies ReadonlyArray<{
  value: DashboardRange;
  label: string;
}>;

export function DashboardPeriodSelect({
  tenantSlug,
  range,
}: {
  tenantSlug: string;
  range: DashboardRange;
}) {
  const router = useRouter();

  return (
    <Select
      value={range}
      onValueChange={(nextRange) => {
        if (nextRange !== range) {
          router.push(`/app/${tenantSlug}?range=${nextRange}`, {
            scroll: false,
          });
        }
      }}
    >
      <SelectTrigger
        aria-label="Dashboard reporting period"
        className="bg-card h-10 w-[164px] rounded-xl px-3.5 text-sm font-medium shadow-[var(--shadow-button)]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent align="end">
        {dashboardPeriods.map((period) => (
          <SelectItem key={period.value} value={period.value}>
            {period.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
