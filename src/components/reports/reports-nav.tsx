import {
  ChartNoAxesCombined,
  LayoutDashboard,
  ReceiptText,
} from "lucide-react";
import { SectionNav } from "@/components/shared/section-nav";

const items = [
  { href: "/reports", label: "Overview", icon: LayoutDashboard },
  {
    href: "/reports/sales",
    label: "Sales performance",
    icon: ChartNoAxesCombined,
  },
  {
    href: "/reports/operations",
    label: "Purchasing & expenses",
    icon: ReceiptText,
  },
];

export function ReportsNav({
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
      label="Reports"
    />
  );
}
