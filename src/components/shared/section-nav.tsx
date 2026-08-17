import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SectionNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function SectionNav({
  baseHref,
  current,
  items,
  label,
  className,
}: {
  baseHref: string;
  current: string;
  items: readonly SectionNavItem[];
  label: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-1.5", className)}>
      <nav className="flex gap-1 overflow-x-auto" aria-label={label}>
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.href;
          return (
            <Link
              key={item.href}
              href={`${baseHref}${item.href}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-[color,background-color,box-shadow] outline-none focus-visible:ring-2",
                active
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-button)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </Card>
  );
}
