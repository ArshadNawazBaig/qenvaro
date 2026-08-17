"use client";

import { CalendarDays, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SelectField } from "@/components/ui/select";
import type { ReportsOverviewRange } from "@/modules/reports/overview-schemas";
import type { SalesReportStoreOption } from "@/modules/reports/sales-schemas";

const rangeOptions: Array<{
  value: ReportsOverviewRange;
  label: string;
}> = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

export function ReportsOverviewToolbar({
  range,
  selectedStoreId,
  stores,
}: {
  range: ReportsOverviewRange;
  selectedStoreId: string;
  stores: SalesReportStoreOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(values: { range?: ReportsOverviewRange; store?: string }) {
    const next = new URLSearchParams(searchParams.toString());
    if (values.range) {
      if (values.range === "30d") next.delete("range");
      else next.set("range", values.range);
    }
    if (values.store) {
      if (values.store === "all") next.delete("store");
      else next.set("store", values.store);
    }
    const suffix = next.toString();
    startTransition(() =>
      router.push(suffix ? `${pathname}?${suffix}` : pathname),
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
      <div className="relative min-w-0 sm:w-48">
        <CalendarDays className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2" />
        <SelectField
          ariaLabel="Reports overview period"
          value={range}
          disabled={pending}
          onValueChange={(value) =>
            update({ range: value as ReportsOverviewRange })
          }
          options={rangeOptions}
          triggerClassName="min-w-0 pl-9"
        />
      </div>
      <div className="relative min-w-0 sm:w-64">
        <Store className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2" />
        <SelectField
          ariaLabel="Reports overview store"
          value={selectedStoreId}
          disabled={pending || stores.length === 0}
          onValueChange={(value) => update({ store: value })}
          options={[
            { value: "all", label: "All assigned stores" },
            ...stores.map((store) => ({
              value: store.id,
              label: `${store.name} · ${store.code}`,
            })),
          ]}
          triggerClassName="min-w-0 pl-9"
        />
      </div>
    </div>
  );
}
