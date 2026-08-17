"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  ClipboardList,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type InventorySection =
  "overview" | "adjustments" | "transfers" | "availability" | "alerts";

export function InventoryNav({
  tenantSlug,
  current,
}: {
  tenantSlug: string;
  current: InventorySection;
}) {
  const router = useRouter();
  const base = `/app/${tenantSlug}/inventory`;
  const items = [
    {
      id: "overview",
      label: "Stock overview",
      href: "",
      icon: Warehouse,
    },
    {
      id: "adjustments",
      label: "Adjustments",
      href: "/adjustments",
      icon: ClipboardList,
    },
    {
      id: "transfers",
      label: "Transfers",
      href: "/transfers",
      icon: ArrowRightLeft,
    },
    {
      id: "availability",
      label: "Availability",
      href: "/availability",
      icon: Building2,
    },
    {
      id: "alerts",
      label: "Low-stock alerts",
      href: "/alerts",
      icon: AlertTriangle,
    },
  ] as const;
  return (
    <Card className="p-1" aria-label="Inventory sections">
      <div className="sm:hidden">
        <SelectField
          ariaLabel="Inventory section"
          options={items.map((item) => ({
            label: item.label,
            value: item.id,
          }))}
          value={current}
          onValueChange={(value) => {
            const item = items.find((candidate) => candidate.id === value);
            if (item) router.push(`${base}${item.href}`);
          }}
          triggerClassName="border-0 shadow-none"
        />
      </div>
      <div className="hidden flex-wrap gap-1 sm:flex">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={`${base}${item.href}`}
              aria-current={current === item.id ? "page" : undefined}
              className={cn(
                "text-muted-foreground hover:bg-muted hover:text-foreground flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                current === item.id &&
                  "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-[var(--shadow-button)]",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
