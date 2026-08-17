import {
  Building2,
  CreditCard,
  ShieldCheck,
  Store,
  UserCog,
  UsersRound,
} from "lucide-react";
import { SectionNav } from "@/components/shared/section-nav";

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
    <SectionNav
      baseHref={`/app/${tenantSlug}`}
      current={current}
      items={items}
      label="Business settings"
    />
  );
}
