import {
  Building2,
  CreditCard,
  ShieldCheck,
  Store,
  UserCog,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const items = [
  { href: "/settings/business", label: "Business", icon: Building2 },
  { href: "/settings/stores", label: "Stores", icon: Store },
  { href: "/settings/members", label: "Team", icon: UsersRound },
  { href: "/settings/roles", label: "Roles", icon: UserCog },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/security", label: "Security & data", icon: ShieldCheck },
];

export function SettingsNav({
  tenantSlug,
  current,
}: {
  tenantSlug: string;
  current: string;
}) {
  return (
    <nav
      className="bg-card flex gap-1 overflow-x-auto rounded-xl border p-1"
      aria-label="Business settings"
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
