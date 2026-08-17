import { Building2, ClipboardList, Receipt, TrendingUp } from "lucide-react";
import { SectionNav } from "@/components/shared/section-nav";

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
    <SectionNav
      baseHref={`/app/${tenantSlug}`}
      current={current}
      items={items}
      label="Purchasing and expenses"
    />
  );
}
