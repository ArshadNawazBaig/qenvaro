import { Check, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformPlans } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Platform plans" };
export default async function PlatformPlansPage() {
  const context = await requireVerifiedPlatformContext();
  const planItems = getPlatformPlans(context);
  return (
    <PageContainer size="wide">
      <PageHeader
        eyebrow="Platform"
        title="Plan catalog"
        description="Central entitlement, quota, display-price, and Stripe price-readiness configuration."
      />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {planItems.map((plan) => (
          <Card key={plan.key} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">{plan.name}</p>
                <p className="text-muted-foreground mt-1 text-sm leading-5">
                  {plan.description}
                </p>
              </div>
              <CreditCard className="text-primary size-5" />
            </div>
            <div className="mt-5">
              <p className="text-2xl font-semibold">
                {plan.monthlyPriceMinor === null
                  ? "Custom"
                  : formatMoney({
                      amountMinor: plan.monthlyPriceMinor,
                      currency: plan.currency,
                    })}
              </p>
              <p className="text-muted-foreground text-xs">
                {plan.monthlyPriceMinor === null
                  ? "Contract pricing"
                  : "per month"}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge
                variant={plan.monthlyPriceConfigured ? "success" : "warning"}
              >
                Monthly {plan.monthlyPriceConfigured ? "ready" : "missing"}
              </Badge>
              <Badge
                variant={plan.annualPriceConfigured ? "success" : "warning"}
              >
                Annual {plan.annualPriceConfigured ? "ready" : "missing"}
              </Badge>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
              {Object.entries(plan.limits).map(([key, value]) => (
                <div key={key} className="rounded-lg border p-2">
                  <p className="font-semibold">{value ?? "Flexible"}</p>
                  <p className="text-muted-foreground capitalize">{key}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2">
              {plan.features.map((feature) => (
                <p key={feature} className="flex items-center gap-2 text-xs">
                  <Check className="text-success-foreground size-3.5" />
                  {feature}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Production Stripe Price IDs remain server-only environment
        configuration. Runtime plan access continues to derive from verified
        webhook projections.
      </p>
    </PageContainer>
  );
}
