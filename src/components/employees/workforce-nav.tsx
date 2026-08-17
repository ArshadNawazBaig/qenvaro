import Link from "next/link";
import {
  CalendarCheck2,
  CalendarDays,
  IdCard,
  WalletCards,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/employees", label: "Employees", icon: IdCard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck2 },
  { href: "/leave", label: "Leave", icon: CalendarDays },
  { href: "/payroll", label: "Payroll", icon: WalletCards },
];

export function WorkforceNav({
  tenantSlug,
  current,
}: {
  tenantSlug: string;
  current: (typeof items)[number]["href"];
}) {
  return (
    <nav
      className="bg-card flex gap-1 overflow-x-auto rounded-xl border p-1"
      aria-label="People and payroll"
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
