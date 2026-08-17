import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Gauge,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BillingManagementActions,
  BillingPlanPicker,
} from "@/components/billing/billing-console";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { brand } from "@/config/brand";
import { getBillingOverview } from "@/modules/billing/billing-service";
import { hasPermission } from "@/modules/permissions/permissions";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Billing settings" };

function statusPresentation(status: string) {
  if (status === "active")
    return { label: "Active", variant: "success" as const };
  if (status === "trialing")
    return { label: "Trial", variant: "info" as const };
  if (status === "past_due")
    return { label: "Past due", variant: "warning" as const };
  if (status === "canceled")
    return { label: "Canceled", variant: "destructive" as const };
  if (status === "suspended")
    return { label: "Suspended", variant: "destructive" as const };
  return { label: status.replaceAll("_", " "), variant: "secondary" as const };
}

function formatDate(value: string | null): string {
  if (!value) return "Not available";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { tenantSlug } = await params;
  const { checkout } = await searchParams;
  const context = await requireTenantContext(tenantSlug, {
    allowSuspended: true,
  }).catch(() => notFound());
  if (!hasPermission(context.permissions, "billing:read")) notFound();
  const canManage = hasPermission(context.permissions, "billing:manage");
  const billing = await getBillingOverview(context);
  const status = statusPresentation(billing.billingStatus);
  return (
    <PageContainer>
      <PageHeader
        title="Plans and billing"
        description="Manage the organization subscription, usage, and Stripe billing portal."
        actions={
          billing.hasStripeSubscription ? (
            <BillingManagementActions
              tenantSlug={tenantSlug}
              canManage={canManage}
              providerEnabled={billing.providerEnabled}
              cancelAtPeriodEnd={billing.cancelAtPeriodEnd}
            />
          ) : undefined
        }
      />
      <SettingsNav tenantSlug={tenantSlug} current="/settings/billing" />

      {checkout === "success" && (
        <div
          role="status"
          className="bg-success/15 text-success-foreground flex gap-3 rounded-xl border p-4 text-sm"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          Checkout returned successfully. Plan access changes only after a
          verified Stripe webhook is projected.
        </div>
      )}
      {checkout === "cancelled" && (
        <div
          role="status"
          className="bg-warning/15 text-warning-foreground flex gap-3 rounded-xl border p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Checkout was cancelled. Your current entitlement is unchanged.
        </div>
      )}
      {!billing.providerEnabled && (
        <div
          role="status"
          className="bg-warning/15 text-warning-foreground flex gap-3 rounded-xl border p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Stripe test-mode credentials and price IDs are not configured. Billing
          mutations are safely disabled.
        </div>
      )}
      {!canManage && (
        <div className="bg-muted text-muted-foreground rounded-xl border p-4 text-sm">
          Billing is read-only for administrators. Only the business owner can
          change the subscription.
        </div>
      )}

      <section
        className="grid gap-4 lg:grid-cols-3"
        aria-label="Current billing summary"
      >
        <Card>
          <CardContent className="flex items-center gap-4">
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <CreditCard className="size-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">Current plan</p>
              <p className="text-xl font-semibold">{billing.planName}</p>
              <Badge variant={status.variant} className="mt-1 capitalize">
                {status.label}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-lg">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">
                {billing.billingStatus === "trialing"
                  ? "Trial ends"
                  : billing.cancelAtPeriodEnd
                    ? "Access through"
                    : "Current period ends"}
              </p>
              <p className="font-semibold">
                {formatDate(
                  billing.billingStatus === "trialing"
                    ? billing.trialEndsAt
                    : billing.currentPeriodEndsAt,
                )}
              </p>
              <p className="text-muted-foreground mt-1 text-xs capitalize">
                {billing.billingInterval
                  ? `${billing.billingInterval}ly billing`
                  : billing.billingSource.replaceAll("_", " ")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4">
            <span className="bg-success/20 text-success-foreground flex size-10 items-center justify-center rounded-lg">
              <Gauge className="size-5" />
            </span>
            <div>
              <p className="text-muted-foreground text-xs">
                Entitlement source
              </p>
              <p className="font-semibold">
                {billing.billingSource === "stripe_webhook"
                  ? "Verified Stripe webhook"
                  : "Signup trial"}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Redirects never activate access
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Plan usage</CardTitle>
          <CardDescription>
            Server-counted usage against the current tenant plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          {billing.usage.map((item) => {
            const percentage = item.limit
              ? Math.min(100, Math.round((item.used / item.limit) * 100))
              : 0;
            return (
              <div key={item.resource}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-muted-foreground">
                    {item.used.toLocaleString()} /{" "}
                    {item.limit?.toLocaleString() ?? "Flexible"}
                  </span>
                </div>
                <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Available plans</h2>
          <p className="text-muted-foreground text-sm">
            Upgrades apply immediately. Downgrades are scheduled for the end of
            the current paid period.
          </p>
        </div>
        <BillingPlanPicker
          tenantSlug={tenantSlug}
          currentPlan={billing.planKey}
          currentInterval={billing.billingInterval}
          canManage={canManage}
          configuredPlans={billing.configuredPlans}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Enterprise</CardTitle>
          <CardDescription>
            Contract limits, optional dedicated infrastructure, and tailored
            support.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            className="text-primary text-sm font-medium hover:underline"
            href={`mailto:${brand.supportEmail}`}
          >
            Contact {brand.name} sales at {brand.supportEmail}
          </a>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
