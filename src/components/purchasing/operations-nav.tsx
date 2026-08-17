import { Building2, ClipboardList, Receipt, TrendingUp } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const items = [
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/purchases", label: "Purchases", icon: ClipboardList },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports/operations", label: "Operations report", icon: TrendingUp },
];

export function OperationsNav({
  tenantSlug,
  current,
}: {
  tenantSlug: string;
  current: string;
}) {
  return (
    <nav
      className="bg-card flex gap-1 overflow-x-auto rounded-xl border p-1"
      aria-label="Purchasing and expenses"
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={`/app/${tenantSlug}${item.href}`}
            aria-current={current === item.href ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2",
              current === item.href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
