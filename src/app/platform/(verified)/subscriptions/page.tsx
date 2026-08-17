import { AlertTriangle, CalendarDays, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformSubscriptions } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Platform subscriptions" };
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not available";
}
export default async function PlatformSubscriptionsPage() {
  const context = await requireVerifiedPlatformContext();
  const data = await getPlatformSubscriptions(context);
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform"
        title="Subscriptions, trials and failed payments"
        description="Safe provider projection metadata. Redirects and browser input never change tenant access."
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Provider subscriptions"
          value={data.items.length.toLocaleString()}
          detail="All projected records"
          icon={CreditCard}
        />
        <MetricCard
          label="Active signup trials"
          value={data.trialingTenants.toLocaleString()}
          detail="Tenant projections"
          icon={CalendarDays}
          tone="muted"
        />
        <MetricCard
          label="Failed-payment attention"
          value={data.failedPaymentTenants.toLocaleString()}
          detail="Past due or unpaid"
          icon={AlertTriangle}
          tone={data.failedPaymentTenants ? "warning" : "success"}
        />
      </section>
      {data.items.length === 0 ? (
        <Card className="p-10 text-center">
          <CreditCard className="text-muted-foreground mx-auto size-8" />
          <p className="mt-3 font-semibold">No provider subscriptions yet</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Signup trial entitlements remain visible on the tenant list.
          </p>
        </Card>
      ) : (
        <Card>
          {data.items.map((item) => (
            <article
              key={item.id}
              className="bg-card grid gap-3 border-b p-5 last:border-b-0 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,.8fr)_minmax(0,.8fr)_minmax(0,1fr)_auto] lg:items-center"
            >
              <div>
                <p className="font-semibold">{item.businessName}</p>
                <p className="text-muted-foreground mt-1 font-mono text-xs">
                  {item.providerSubscriptionId ?? "No provider ID"}
                </p>
              </div>
              <span className="text-sm capitalize">{item.plan}</span>
              <Badge
                variant={
                  item.status === "active" || item.status === "trialing"
                    ? "success"
                    : "warning"
                }
                className="w-fit capitalize"
              >
                {item.status.replaceAll("_", " ")}
              </Badge>
              <p className="text-muted-foreground text-xs">
                Through {date(item.periodEnd)}
                {item.cancelAtPeriodEnd ? " · cancels" : ""}
              </p>
              {item.tenantId && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/platform/tenants/${item.tenantId}`}>
                    Tenant
                  </Link>
                </Button>
              )}
            </article>
          ))}
        </Card>
      )}
    </PageContainer>
  );
}
