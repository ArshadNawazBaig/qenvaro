import "server-only";

import type { Db } from "mongodb";
import { getDatabase } from "@/server/db/client";
import type { VerifiedPlatformContext } from "@/server/auth/platform-context";

export interface AggregateCount {
  key: string;
  count: number;
}

export interface PlatformOverview {
  generatedAt: string;
  metrics: {
    tenants: number;
    users: number;
    activeSubscriptions: number;
    verifiedWebhooks24h: number;
  };
  tenants: {
    byBillingStatus: AggregateCount[];
    byPlan: AggregateCount[];
    trialing: number;
    suspended: number;
  };
  subscriptions: {
    total: number;
    byStatus: AggregateCount[];
    attentionRequired: number;
  };
  webhooks: {
    byProcessingStatus: AggregateCount[];
    recentTypes: AggregateCount[];
    verified24h: number;
    failed24h: number;
    staleProcessing: number;
    latestVerifiedAt: string | null;
  };
  system: {
    database: "operational";
    databaseLatencyMs: number;
    schemaVersion: number;
    lastMigrationAt: string | null;
    webhookPipeline: "operational" | "attention";
  };
}

function keyOf(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "unknown";
}

async function aggregateCounts(
  database: Db,
  collection: string,
  field: string,
  match: Record<string, unknown> = {},
): Promise<AggregateCount[]> {
  const rows = await database
    .collection(collection)
    .aggregate<{ _id: unknown; count: number }>([
      { $match: match },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();
  return rows.map((row) => ({ key: keyOf(row._id), count: row.count }));
}

function countFor(counts: AggregateCount[], key: string): number {
  return counts.find((item) => item.key === key)?.count ?? 0;
}

export async function getPlatformOverview(
  context: VerifiedPlatformContext,
  providedDatabase?: Db,
): Promise<PlatformOverview> {
  if (context.access !== "allow") {
    throw new Error("Verified platform context is required.");
  }
  const database = providedDatabase ?? (await getDatabase());
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleThreshold = new Date(now.getTime() - 10 * 60 * 1000);
  const pingStartedAt = performance.now();
  await database.command({ ping: 1 });
  const databaseLatencyMs = Math.max(
    0,
    Math.round((performance.now() - pingStartedAt) * 10) / 10,
  );

  const [
    tenantCount,
    userCount,
    tenantStatuses,
    tenantPlans,
    subscriptionCount,
    subscriptionStatuses,
    webhookStatuses,
    recentWebhookTypes,
    verifiedWebhooks24h,
    failedWebhooks24h,
    staleProcessing,
    latestWebhook,
    latestMigration,
  ] = await Promise.all([
    database.collection("tenantProfiles").countDocuments(),
    database.collection("user").countDocuments(),
    aggregateCounts(database, "tenantProfiles", "billingStatus"),
    aggregateCounts(database, "tenantProfiles", "planKey"),
    database.collection("subscription").countDocuments(),
    aggregateCounts(database, "subscription", "status"),
    aggregateCounts(database, "webhookEvents", "processingStatus", {
      provider: "stripe",
      verifiedAt: { $type: "date" },
    }),
    aggregateCounts(database, "webhookEvents", "type", {
      provider: "stripe",
      verifiedAt: { $gte: dayAgo },
    }),
    database.collection("webhookEvents").countDocuments({
      provider: "stripe",
      verifiedAt: { $gte: dayAgo },
    }),
    database.collection("webhookEvents").countDocuments({
      provider: "stripe",
      verifiedAt: { $gte: dayAgo },
      processingStatus: "failed",
    }),
    database.collection("webhookEvents").countDocuments({
      provider: "stripe",
      verifiedAt: { $type: "date" },
      processingStatus: "processing",
      lastAttemptAt: { $lt: staleThreshold },
    }),
    database
      .collection<{ verifiedAt: Date }>("webhookEvents")
      .find(
        { provider: "stripe", verifiedAt: { $type: "date" } },
        { projection: { verifiedAt: 1 } },
      )
      .sort({ verifiedAt: -1 })
      .limit(1)
      .next(),
    database
      .collection<{ version: number; appliedAt: Date }>("schemaMigrations")
      .find({}, { projection: { version: 1, appliedAt: 1 } })
      .sort({ version: -1 })
      .limit(1)
      .next(),
  ]);
  const activeSubscriptions =
    countFor(subscriptionStatuses, "active") +
    countFor(subscriptionStatuses, "trialing");
  const attentionRequired =
    countFor(subscriptionStatuses, "past_due") +
    countFor(subscriptionStatuses, "unpaid") +
    countFor(subscriptionStatuses, "incomplete_expired");

  return {
    generatedAt: now.toISOString(),
    metrics: {
      tenants: tenantCount,
      users: userCount,
      activeSubscriptions,
      verifiedWebhooks24h,
    },
    tenants: {
      byBillingStatus: tenantStatuses,
      byPlan: tenantPlans,
      trialing: countFor(tenantStatuses, "trialing"),
      suspended: countFor(tenantStatuses, "suspended"),
    },
    subscriptions: {
      total: subscriptionCount,
      byStatus: subscriptionStatuses,
      attentionRequired,
    },
    webhooks: {
      byProcessingStatus: webhookStatuses,
      recentTypes: recentWebhookTypes,
      verified24h: verifiedWebhooks24h,
      failed24h: failedWebhooks24h,
      staleProcessing,
      latestVerifiedAt: latestWebhook?.verifiedAt.toISOString() ?? null,
    },
    system: {
      database: "operational",
      databaseLatencyMs,
      schemaVersion: latestMigration?.version ?? 0,
      lastMigrationAt: latestMigration?.appliedAt.toISOString() ?? null,
      webhookPipeline:
        failedWebhooks24h > 0 || staleProcessing > 0
          ? "attention"
          : "operational",
    },
  };
}
