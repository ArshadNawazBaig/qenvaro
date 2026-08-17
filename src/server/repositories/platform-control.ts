import "server-only";

import { z } from "zod";
import { env } from "@/config/env";
import { planKeySchema, plans } from "@/config/plans";
import { getDatabase } from "@/server/db/client";
import type { VerifiedPlatformContext } from "@/server/auth/platform-context";

function assertVerified(context: VerifiedPlatformContext) {
  if (context.access !== "allow")
    throw new Error("Verified platform context is required.");
}
const querySchema = z.string().trim().max(80).catch("");
const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);
function prefixRegex(value: string) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
}

export interface PlatformTenantListItem {
  tenantId: string;
  slug: string;
  businessName: string;
  planKey: string;
  planName: string;
  billingStatus: string;
  version: number;
  stores: number;
  members: number;
  products: number;
  trialEndsAt: string | null;
}

export async function getPlatformTenants(
  context: VerifiedPlatformContext,
  input: { q?: unknown; page?: unknown },
) {
  assertVerified(context);
  const database = await getDatabase();
  const q = querySchema.parse(input.q);
  const page = pageSchema.parse(input.page);
  const pageSize = 30;
  const filter = q
    ? {
        $or: [
          { slug: prefixRegex(q) },
          { businessName: prefixRegex(q) },
          { tenantId: q },
        ],
      }
    : {};
  const [profiles, total] = await Promise.all([
    database
      .collection<{
        tenantId: string;
        slug: string;
        businessName: string;
        planKey: string;
        billingStatus?: string;
        version?: number;
        trialEndsAt?: Date;
      }>("tenantProfiles")
      .find(filter, {
        projection: {
          tenantId: 1,
          slug: 1,
          businessName: 1,
          planKey: 1,
          billingStatus: 1,
          version: 1,
          trialEndsAt: 1,
        },
      })
      .sort({ businessName: 1, tenantId: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    database.collection("tenantProfiles").countDocuments(filter),
  ]);
  const ids = profiles.map((profile) => profile.tenantId);
  async function grouped(collection: string, tenantField: string) {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await database
      .collection(collection)
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            [tenantField]: { $in: ids },
            deletedAt: { $exists: false },
          },
        },
        { $group: { _id: `$${tenantField}`, count: { $sum: 1 } } },
      ])
      .toArray();
    return new Map(rows.map((row) => [row._id, row.count]));
  }
  const [storeCounts, memberCounts, productCounts] = await Promise.all([
    grouped("stores", "tenantId"),
    grouped("member", "organizationId"),
    grouped("products", "tenantId"),
  ]);
  const items: PlatformTenantListItem[] = profiles.map((profile) => {
    const planKey = planKeySchema.parse(profile.planKey);
    return {
      tenantId: profile.tenantId,
      slug: profile.slug,
      businessName: profile.businessName,
      planKey,
      planName: plans[planKey].name,
      billingStatus: profile.billingStatus ?? "unknown",
      version: profile.version ?? 1,
      stores: storeCounts.get(profile.tenantId) ?? 0,
      members: memberCounts.get(profile.tenantId) ?? 0,
      products: productCounts.get(profile.tenantId) ?? 0,
      trialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
    };
  });
  return {
    items,
    q,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export async function getPlatformTenantDetail(
  context: VerifiedPlatformContext,
  tenantId: string,
) {
  assertVerified(context);
  const database = await getDatabase();
  const profile = await database
    .collection<{
      tenantId: string;
      slug: string;
      businessName: string;
      planKey: string;
      billingStatus?: string;
      version?: number;
      currency?: string;
      locale?: string;
      timezone?: string;
      trialEndsAt?: Date;
      currentPeriodEndsAt?: Date;
      suspendedAt?: Date;
      suspensionReason?: string;
    }>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        projection: {
          tenantId: 1,
          slug: 1,
          businessName: 1,
          planKey: 1,
          billingStatus: 1,
          version: 1,
          currency: 1,
          locale: 1,
          timezone: 1,
          trialEndsAt: 1,
          currentPeriodEndsAt: 1,
          suspendedAt: 1,
          suspensionReason: 1,
        },
      },
    );
  if (!profile) return null;
  const [
    stores,
    members,
    products,
    employees,
    subscription,
    grants,
    overrides,
  ] = await Promise.all([
    database.collection("stores").countDocuments({
      tenantId,
      status: "active",
      deletedAt: { $exists: false },
    }),
    database.collection("member").countDocuments({ organizationId: tenantId }),
    database
      .collection("products")
      .countDocuments({ tenantId, deletedAt: { $exists: false } }),
    database
      .collection("employees")
      .countDocuments({ tenantId, status: "active" }),
    database
      .collection<{
        status?: string;
        stripeSubscriptionId?: string;
        stripeCustomerId?: string;
        periodEnd?: Date;
        cancelAtPeriodEnd?: boolean;
      }>("subscription")
      .findOne(
        { referenceId: tenantId },
        {
          sort: { createdAt: -1 },
          projection: {
            status: 1,
            stripeSubscriptionId: 1,
            stripeCustomerId: 1,
            periodEnd: 1,
            cancelAtPeriodEnd: 1,
          },
        },
      ),
    database
      .collection<{
        _id: string;
        status: string;
        reason: string;
        grantedAt: Date;
        expiresAt: Date;
        revokedAt?: Date;
      }>("supportAccessGrants")
      .find(
        { tenantId },
        {
          projection: {
            status: 1,
            reason: 1,
            grantedAt: 1,
            expiresAt: 1,
            revokedAt: 1,
          },
        },
      )
      .sort({ grantedAt: -1 })
      .limit(20)
      .toArray(),
    database
      .collection<{ flagId: string; enabled: boolean }>(
        "tenantFeatureFlagOverrides",
      )
      .find({ tenantId }, { projection: { flagId: 1, enabled: 1 } })
      .toArray(),
  ]);
  const planKey = planKeySchema.parse(profile.planKey);
  return {
    ...profile,
    planKey,
    planName: plans[planKey].name,
    billingStatus: profile.billingStatus ?? "unknown",
    version: profile.version ?? 1,
    trialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: profile.currentPeriodEndsAt?.toISOString() ?? null,
    suspendedAt: profile.suspendedAt?.toISOString() ?? null,
    usage: {
      stores: { used: stores, limit: plans[planKey].limits.stores },
      members: { used: members, limit: plans[planKey].limits.members },
      products: { used: products, limit: plans[planKey].limits.products },
      employees: { used: employees, limit: null },
    },
    subscription: subscription
      ? {
          status: subscription.status ?? "unknown",
          providerSubscriptionId: subscription.stripeSubscriptionId ?? null,
          providerCustomerId: subscription.stripeCustomerId ?? null,
          periodEnd: subscription.periodEnd?.toISOString() ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === true,
        }
      : null,
    supportGrants: grants.map((grant) => ({
      ...grant,
      id: grant._id,
      grantedAt: grant.grantedAt.toISOString(),
      expiresAt: grant.expiresAt.toISOString(),
      revokedAt: grant.revokedAt?.toISOString() ?? null,
    })),
    overrides,
  };
}

export async function getPlatformUsers(
  context: VerifiedPlatformContext,
  input: { q?: unknown; page?: unknown },
) {
  assertVerified(context);
  const database = await getDatabase();
  const q = querySchema.parse(input.q);
  const page = pageSchema.parse(input.page);
  const pageSize = 30;
  const filter = q
    ? { $or: [{ name: prefixRegex(q) }, { email: prefixRegex(q) }] }
    : {};
  const [users, total] = await Promise.all([
    database
      .collection<{
        _id: string;
        name: string;
        email: string;
        role?: string;
        twoFactorEnabled?: boolean;
        emailVerified?: boolean;
        createdAt: Date;
        banned?: boolean;
        banExpires?: Date;
      }>("user")
      .find(filter, {
        projection: {
          name: 1,
          email: 1,
          role: 1,
          twoFactorEnabled: 1,
          emailVerified: 1,
          createdAt: 1,
          banned: 1,
          banExpires: 1,
        },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    database.collection("user").countDocuments(filter),
  ]);
  const ids = users.map((user) => user._id);
  const memberships = ids.length
    ? await database
        .collection<{ userId: string }>("member")
        .aggregate<{ _id: string; count: number }>([
          { $match: { userId: { $in: ids } } },
          { $group: { _id: "$userId", count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const counts = new Map(memberships.map((row) => [row._id, row.count]));
  return {
    items: users.map((user) => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role ?? "user",
      twoFactorEnabled: user.twoFactorEnabled === true,
      emailVerified: user.emailVerified === true,
      banned:
        user.banned === true &&
        (!(user.banExpires instanceof Date) || user.banExpires > new Date()),
      memberships: counts.get(user._id) ?? 0,
      createdAt: user.createdAt.toISOString(),
    })),
    q,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}

export async function getPlatformSubscriptions(
  context: VerifiedPlatformContext,
) {
  assertVerified(context);
  const database = await getDatabase();
  const [subscriptions, trialProfiles, failedProfiles] = await Promise.all([
    database
      .collection<{
        _id: string;
        referenceId?: string;
        plan?: string;
        status?: string;
        stripeSubscriptionId?: string;
        periodStart?: Date;
        periodEnd?: Date;
        cancelAtPeriodEnd?: boolean;
        createdAt?: Date;
      }>("subscription")
      .find(
        {},
        {
          projection: {
            referenceId: 1,
            plan: 1,
            status: 1,
            stripeSubscriptionId: 1,
            periodStart: 1,
            periodEnd: 1,
            cancelAtPeriodEnd: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray(),
    database.collection("tenantProfiles").countDocuments({
      billingStatus: "trialing",
      trialEndsAt: { $gt: new Date() },
    }),
    database
      .collection("tenantProfiles")
      .countDocuments({ billingStatus: { $in: ["past_due", "unpaid"] } }),
  ]);
  const tenantIds = [
    ...new Set(
      subscriptions.flatMap((item) =>
        item.referenceId ? [item.referenceId] : [],
      ),
    ),
  ];
  const profiles = await database
    .collection<{ tenantId: string; businessName: string }>("tenantProfiles")
    .find(
      { tenantId: { $in: tenantIds } },
      { projection: { tenantId: 1, businessName: 1 } },
    )
    .toArray();
  const names = new Map(
    profiles.map((profile) => [profile.tenantId, profile.businessName]),
  );
  return {
    trialingTenants: trialProfiles,
    failedPaymentTenants: failedProfiles,
    items: subscriptions.map((item) => ({
      id: item._id,
      tenantId: item.referenceId ?? null,
      businessName: item.referenceId
        ? (names.get(item.referenceId) ?? "Unknown tenant")
        : "Unlinked",
      plan: item.plan ?? "unknown",
      status: item.status ?? "unknown",
      providerSubscriptionId: item.stripeSubscriptionId ?? null,
      periodStart: item.periodStart?.toISOString() ?? null,
      periodEnd: item.periodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: item.cancelAtPeriodEnd === true,
    })),
  };
}

export async function getPlatformWebhooks(context: VerifiedPlatformContext) {
  assertVerified(context);
  const database = await getDatabase();
  const items = await database
    .collection<{
      _id: string;
      provider?: string;
      eventId?: string;
      type?: string;
      processingStatus?: string;
      verifiedAt?: Date;
      processedAt?: Date;
      lastAttemptAt?: Date;
      attempts?: number;
      errorName?: string;
    }>("webhookEvents")
    .find(
      {},
      {
        projection: {
          provider: 1,
          eventId: 1,
          type: 1,
          processingStatus: 1,
          verifiedAt: 1,
          processedAt: 1,
          lastAttemptAt: 1,
          attempts: 1,
          errorName: 1,
        },
      },
    )
    .sort({ verifiedAt: -1, _id: -1 })
    .limit(200)
    .toArray();
  return items.map((item) => ({
    id: item._id,
    provider: item.provider ?? "unknown",
    eventId: item.eventId ?? "unknown",
    type: item.type ?? "unknown",
    status: item.processingStatus ?? "unknown",
    verifiedAt: item.verifiedAt?.toISOString() ?? null,
    processedAt: item.processedAt?.toISOString() ?? null,
    lastAttemptAt: item.lastAttemptAt?.toISOString() ?? null,
    attempts: item.attempts ?? 0,
    errorName: item.errorName ?? null,
  }));
}

export function getPlatformPlans(context: VerifiedPlatformContext) {
  assertVerified(context);
  return Object.values(plans).map((plan) => ({
    key: plan.key,
    name: plan.name,
    description: plan.description,
    monthlyPriceMinor: plan.monthlyPriceMinor,
    annualPriceMinor: plan.annualPriceMinor,
    currency: plan.currency,
    limits: plan.limits,
    features: [...plan.features],
    monthlyPriceConfigured:
      plan.key === "enterprise" ||
      Boolean(
        env[
          `STRIPE_${plan.key.toUpperCase() as "STARTER" | "GROWTH" | "BUSINESS"}_MONTHLY_PRICE_ID` as keyof typeof env
        ],
      ),
    annualPriceConfigured:
      plan.key === "enterprise" ||
      Boolean(
        env[
          `STRIPE_${plan.key.toUpperCase() as "STARTER" | "GROWTH" | "BUSINESS"}_ANNUAL_PRICE_ID` as keyof typeof env
        ],
      ),
  }));
}

export async function getPlatformFlags(context: VerifiedPlatformContext) {
  assertVerified(context);
  const database = await getDatabase();
  const [flags, overrides] = await Promise.all([
    database
      .collection<{
        _id: string;
        key: string;
        description: string;
        defaultEnabled: boolean;
        status: string;
        version: number;
        createdAt: Date;
      }>("platformFeatureFlags")
      .find({ status: "active" })
      .sort({ key: 1 })
      .toArray(),
    database
      .collection("tenantFeatureFlagOverrides")
      .aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$flagId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const counts = new Map(overrides.map((row) => [row._id, row.count]));
  return flags.map((flag) => ({
    id: flag._id,
    key: flag.key,
    description: flag.description,
    defaultEnabled: flag.defaultEnabled,
    version: flag.version,
    overrides: counts.get(flag._id) ?? 0,
    createdAt: flag.createdAt.toISOString(),
  }));
}

export async function getPlatformAnnouncements(
  context: VerifiedPlatformContext,
) {
  assertVerified(context);
  const database = await getDatabase();
  const items = await database
    .collection<{
      _id: string;
      title: string;
      message: string;
      severity: string;
      href?: string;
      status: string;
      startsAt: Date;
      endsAt?: Date;
      createdAt: Date;
    }>("platformAnnouncements")
    .find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  return items.map((item) => ({
    id: item._id,
    title: item.title,
    message: item.message,
    severity: item.severity,
    href: item.href ?? null,
    status: item.status,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  }));
}

export async function getPlatformAuditLog(
  context: VerifiedPlatformContext,
  pageValue: unknown,
) {
  assertVerified(context);
  const database = await getDatabase();
  const page = pageSchema.parse(pageValue);
  const pageSize = 40;
  const [items, total] = await Promise.all([
    database
      .collection<{
        _id: string;
        actorId?: string;
        action: string;
        entityType: string;
        entityId: string;
        summary?: string;
        reason?: string;
        requestId?: string;
        createdAt: Date;
      }>("platformAuditLogs")
      .find(
        {},
        {
          projection: {
            actorId: 1,
            action: 1,
            entityType: 1,
            entityId: 1,
            summary: 1,
            reason: 1,
            requestId: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    database.collection("platformAuditLogs").countDocuments(),
  ]);
  return {
    items: items.map((item) => ({
      id: item._id,
      actorId: item.actorId ?? "system",
      action: item.action,
      entityType: item.entityType,
      entityId: item.entityId,
      summary: item.summary ?? "Platform operation recorded.",
      reason: item.reason ?? null,
      requestId: item.requestId ?? "not-recorded",
      createdAt: item.createdAt.toISOString(),
    })),
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}
