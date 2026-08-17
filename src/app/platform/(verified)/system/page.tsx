import {
  Activity,
  CheckCircle2,
  Clock3,
  Database,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireVerifiedPlatformContext } from "@/server/auth/platform-context";
import { getPlatformOverview } from "@/server/repositories/platform-overview";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";
export default async function PlatformSystemPage() {
  const context = await requireVerifiedPlatformContext();
  const overview = await getPlatformOverview(context);
  const rows = [
    {
      icon: Database,
      label: "MongoDB",
      value: `${overview.system.database} · ${overview.system.databaseLatencyMs} ms`,
      healthy: true,
    },
    {
      icon: Webhook,
      label: "Stripe webhook pipeline",
      value: `${overview.system.webhookPipeline} · ${overview.webhooks.failed24h} failed in 24h · ${overview.webhooks.staleProcessing} stale`,
      healthy: overview.system.webhookPipeline === "operational",
    },
    {
      icon: CheckCircle2,
      label: "Database schema",
      value: `Migration ${overview.system.schemaVersion}`,
      healthy: overview.system.schemaVersion > 0,
    },
    {
      icon: Clock3,
      label: "Latest migration",
      value: overview.system.lastMigrationAt
        ? new Date(overview.system.lastMigrationAt).toISOString()
        : "No migration recorded",
      healthy: overview.system.schemaVersion > 0,
    },
  ];
  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Platform"
        title="System health"
        description="Live readiness metadata for the database, schema, and verified webhook pipeline."
        actions={
          <Badge variant="success">
            <Activity className="size-3" /> Live check
          </Badge>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((row) => (
          <Card key={row.label} className="flex items-center gap-4 p-5">
            <span className="bg-muted flex size-11 items-center justify-center rounded-xl">
              <row.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{row.label}</p>
              <p className="text-muted-foreground mt-1 text-sm">{row.value}</p>
            </div>
            <Badge variant={row.healthy ? "success" : "warning"}>
              {row.healthy ? "Healthy" : "Attention"}
            </Badge>
          </Card>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        Generated {overview.generatedAt}. Health reads aggregate metadata only
        and never inspect tenant-owned business records.
      </p>
    </div>
  );
}
