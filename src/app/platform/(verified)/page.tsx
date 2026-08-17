import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  UsersRound,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
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
import {
  getPlatformOverview,
  type AggregateCount,
} from "@/server/repositories/platform-overview";

export const metadata: Metadata = { title: "Platform overview" };

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function AggregateList({
  items,
  total,
  empty,
}: {
  items: AggregateCount[];
  total: number;
  empty: string;
}) {
  if (items.length === 0)
    return <p className="text-muted-foreground py-6 text-sm">{empty}</p>;
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{label(item.key)}</span>
            <span className="text-muted-foreground tabular-nums">
              {item.count.toLocaleString()}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full"
              style={{
                width: `${total === 0 ? 0 : Math.max(3, (item.count / total) * 100)}%`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "No verified events yet";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function PlatformOverviewPage() {
  const context = await requireVerifiedPlatformContext();
  const overview = await getPlatformOverview(context);
  const webhookTotal = overview.webhooks.byProcessingStatus.reduce(
    (total, item) => total + item.count,
    0,
  );
  return (
    <PageContainer size="wide">
      <PageStatus
        tone="live"
        label="Verified platform session"
        detail={`Aggregate SaaS metadata · generated ${formatDate(overview.generatedAt)}`}
      />
      <PageHeader
        eyebrow="Platform"
        title="Service overview"
        description="Tenant posture, subscriptions, verified Stripe processing, and system readiness without tenant business records."
      />
      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Platform metrics"
      >
        <MetricCard
          label="Tenants"
          value={overview.metrics.tenants.toLocaleString()}
          detail={`${overview.tenants.trialing.toLocaleString()} currently trialing`}
          icon={Building2}
        />
        <MetricCard
          label="Platform users"
          value={overview.metrics.users.toLocaleString()}
          detail="Global identity count"
          icon={UsersRound}
          tone="muted"
        />
        <MetricCard
          label="Active subscriptions"
          value={overview.metrics.activeSubscriptions.toLocaleString()}
          detail={`${overview.subscriptions.attentionRequired.toLocaleString()} require attention`}
          icon={CreditCard}
          tone={
            overview.subscriptions.attentionRequired > 0 ? "warning" : "success"
          }
        />
        <MetricCard
          label="Verified webhooks · 24h"
          value={overview.metrics.verifiedWebhooks24h.toLocaleString()}
          detail={`${overview.webhooks.failed24h.toLocaleString()} failed projections`}
          icon={Webhook}
          tone={overview.webhooks.failed24h > 0 ? "warning" : "success"}
        />
      </section>
      <section
        className="grid gap-4 xl:grid-cols-2"
        aria-label="Platform health"
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="text-primary size-4" /> Tenant posture
            </CardTitle>
            <CardDescription>
              Aggregate entitlement status across tenant profiles
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-7 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
                Billing status
              </p>
              <AggregateList
                items={overview.tenants.byBillingStatus}
                total={overview.metrics.tenants}
                empty="No tenant profiles yet."
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
                Plan mix
              </p>
              <AggregateList
                items={overview.tenants.byPlan}
                total={overview.metrics.tenants}
                empty="No plan projections yet."
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="text-primary size-4" /> Subscription health
            </CardTitle>
            <CardDescription>
              Better Auth subscription projections grouped by state
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AggregateList
              items={overview.subscriptions.byStatus}
              total={overview.subscriptions.total}
              empty="No provider subscriptions yet. Signup trials remain visible in tenant posture."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="text-primary size-4" /> Verified Stripe events
            </CardTitle>
            <CardDescription>
              Post-signature processing outcomes; raw payloads are not exposed
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-7 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
                Processing status
              </p>
              <AggregateList
                items={overview.webhooks.byProcessingStatus}
                total={webhookTotal}
                empty="No verified Stripe events yet."
              />
            </div>
            <div>
              <p className="text-muted-foreground mb-4 text-xs font-semibold tracking-wider uppercase">
                Event types · 24h
              </p>
              <AggregateList
                items={overview.webhooks.recentTypes}
                total={overview.webhooks.verified24h}
                empty="No verified events in the last 24 hours."
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="text-primary size-4" /> System health
            </CardTitle>
            <CardDescription>
              Readiness signals from metadata-only platform services
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                icon: Database,
                label: "MongoDB",
                value: `${label(overview.system.database)} · ${overview.system.databaseLatencyMs} ms`,
                healthy: true,
              },
              {
                icon: Webhook,
                label: "Webhook pipeline",
                value: `${label(overview.system.webhookPipeline)} · ${overview.webhooks.staleProcessing} stale`,
                healthy: overview.system.webhookPipeline === "operational",
              },
              {
                icon: CheckCircle2,
                label: "Schema",
                value: `Migration ${overview.system.schemaVersion}`,
                healthy: overview.system.schemaVersion > 0,
              },
              {
                icon: Clock3,
                label: "Latest verified event",
                value: formatDate(overview.webhooks.latestVerifiedAt),
                healthy: overview.webhooks.failed24h === 0,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-muted/60 flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="bg-card flex size-9 items-center justify-center rounded-md border">
                  <item.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {item.value}
                  </span>
                </span>
                <Badge variant={item.healthy ? "success" : "warning"}>
                  {item.healthy ? "Healthy" : "Attention"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
      <p className="text-muted-foreground text-xs">
        This overview uses counts and grouped metadata only. Products,
        customers, sales, employees, compensation, and other tenant-owned
        records are never queried by this repository.
      </p>
    </PageContainer>
  );
}
