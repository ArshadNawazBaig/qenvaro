import {
  CalendarCheck2,
  CalendarDays,
  IdCard,
  WalletCards,
} from "lucide-react";
import { SectionNav } from "@/components/shared/section-nav";

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
    <SectionNav
      baseHref={`/app/${tenantSlug}`}
      current={current}
      items={items}
      label="People and payroll"
    />
  );
}
