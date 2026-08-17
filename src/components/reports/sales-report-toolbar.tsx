"use client";

import { CalendarDays, Store } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type {
  SalesReportRange,
  SalesReportStoreOption,
} from "@/modules/reports/sales-schemas";

const ranges: Array<{ value: SalesReportRange; label: string }> = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

export function SalesReportToolbar({
  range,
  selectedStoreId,
  stores,
}: {
  range: SalesReportRange;
  selectedStoreId: string;
  stores: SalesReportStoreOption[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(values: { range?: SalesReportRange; store?: string }) {
    const next = new URLSearchParams(searchParams.toString());
    if (values.range) {
      if (values.range === "30d") next.delete("range");
      else next.set("range", values.range);
    }
    if (values.store) {
      if (values.store === "all") next.delete("store");
      else next.set("store", values.store);
    }
    next.delete("page");
    const suffix = next.toString();
    startTransition(() =>
      router.push(suffix ? `${pathname}?${suffix}` : pathname),
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
        <CalendarDays className="text-muted-foreground hidden size-4 shrink-0 sm:block" />
        {ranges.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={range === option.value ? "default" : "outline"}
            aria-pressed={range === option.value}
            disabled={pending}
            onClick={() => update({ range: option.value })}
            className="shrink-0"
          >
            {option.label}
          </Button>
        ))}
      </div>
      <label className="relative flex min-w-0 items-center sm:w-64">
        <span className="sr-only">Report store</span>
        <Store className="text-muted-foreground pointer-events-none absolute left-3 size-4" />
        <Select
          value={selectedStoreId}
          disabled={pending || stores.length === 0}
          onChange={(event) => update({ store: event.target.value })}
          className="min-w-0 pr-8 pl-9"
        >
          <option value="all">All assigned stores</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name} · {store.code}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
