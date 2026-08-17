import {
  Activity,
  Building2,
  CreditCard,
  Gauge,
  LifeBuoy,
  ShieldAlert,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  GrantSupportDialog,
  RevokeSupportDialog,
  TenantLifecycleDialog,
} from "@/components/platform/control-actions";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformTenantDetail } from "@/server/repositories/platform-control";

export const metadata: Metadata = { title: "Tenant metadata" };
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Not available";
}

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const context = await requireVerifiedPlatformContext();
  const tenant = await getPlatformTenantDetail(context, tenantId);
  if (!tenant) notFound();
  const activeGrant = tenant.supportGrants.find(
    (grant) =>
      grant.status === "active" && new Date(grant.expiresAt) > new Date(),
  );
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          <ShieldAlert className="size-3" /> Metadata boundary
        </Badge>
        <span className="text-muted-foreground text-xs">
          No products, sales, customers, employees, or compensation records are
          loaded.
        </span>
      </div>
      <PageHeader
        eyebrow="Tenant"
        title={tenant.businessName}
        description={`${tenant.slug} · ${tenant.tenantId}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {!activeGrant && <GrantSupportDialog tenantId={tenant.tenantId} />}
            <TenantLifecycleDialog
              tenantId={tenant.tenantId}
              version={tenant.version}
              suspended={tenant.billingStatus === "suspended"}
            />
          </div>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Stores"
          value={tenant.usage.stores.used.toLocaleString()}
          detail={
            tenant.usage.stores.limit === null
              ? "Flexible limit"
              : `Limit ${tenant.usage.stores.limit}`
          }
          icon={Building2}
        />
        <MetricCard
          label="Members"
          value={tenant.usage.members.used.toLocaleString()}
          detail={
            tenant.usage.members.limit === null
              ? "Flexible limit"
              : `Limit ${tenant.usage.members.limit}`
          }
          icon={Gauge}
        />
        <MetricCard
          label="Products"
          value={tenant.usage.products.used.toLocaleString()}
          detail={
            tenant.usage.products.limit === null
              ? "Flexible limit"
              : `Limit ${tenant.usage.products.limit}`
          }
          icon={Activity}
        />
        <MetricCard
          label="Billing"
          value={tenant.billingStatus.replaceAll("_", " ")}
          detail={tenant.planName}
          icon={CreditCard}
          tone={tenant.billingStatus === "suspended" ? "warning" : "success"}
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tenant profile metadata</CardTitle>
            <CardDescription>
              Regional and entitlement projection only
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {[
              ["Plan", tenant.planName],
              ["Billing status", tenant.billingStatus],
              ["Currency", tenant.currency ?? "Not set"],
              ["Locale", tenant.locale ?? "Not set"],
              ["Timezone", tenant.timezone ?? "Not set"],
              ["Trial ends", date(tenant.trialEndsAt)],
              ["Paid through", date(tenant.currentPeriodEndsAt)],
              ["Suspended at", date(tenant.suspendedAt)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">{label}</p>
                <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Provider subscription</CardTitle>
            <CardDescription>
              Provider identifiers and status; no payment instrument data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tenant.subscription ? (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  {tenant.subscription.status}
                </p>
                <p className="break-all">
                  <span className="text-muted-foreground">Subscription:</span>{" "}
                  {tenant.subscription.providerSubscriptionId ?? "Not linked"}
                </p>
                <p className="break-all">
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  {tenant.subscription.providerCustomerId ?? "Not linked"}
                </p>
                <p>
                  <span className="text-muted-foreground">Period end:</span>{" "}
                  {date(tenant.subscription.periodEnd)}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No Stripe subscription projection is linked.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="size-5" /> Break-glass support controls
            </CardTitle>
            <CardDescription>
              Grants are disabled by default, reason-required, time-limited,
              auditable, visible, and revocable. The platform UI intentionally
              contains no tenant-record browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tenant.supportGrants.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No support grants have ever been created.
              </p>
            ) : (
              <div className="space-y-3">
                {tenant.supportGrants.map((grant) => {
                  const currentlyActive =
                    grant.status === "active" &&
                    new Date(grant.expiresAt) > new Date();
                  return (
                    <div
                      key={grant.id}
                      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={currentlyActive ? "warning" : "secondary"}
                          >
                            {currentlyActive
                              ? "Active"
                              : grant.status === "active"
                                ? "Expired"
                                : grant.status}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            expires {date(grant.expiresAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">{grant.reason}</p>
                      </div>
                      {currentlyActive && (
                        <RevokeSupportDialog grantId={grant.id} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
