import "server-only";

import { planKeySchema, plans, type PlanKey } from "@/config/plans";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
import {
  configuredBillingPlans,
  isStripeBillingProviderEnabled,
} from "./config";

export interface BillingUsageItem {
  resource: "stores" | "members" | "products";
  label: string;
  used: number;
  limit: number | null;
}

export interface BillingOverview {
  planKey: PlanKey;
  planName: string;
  billingStatus: string;
  billingSource: string;
  billingInterval: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeSubscription: boolean;
  providerEnabled: boolean;
  configuredPlans: ReturnType<typeof configuredBillingPlans>;
  usage: BillingUsageItem[];
}

export class BillingOverviewError extends Error {
  constructor() {
    super("The tenant billing projection is missing.");
    this.name = "BillingOverviewError";
  }
}

export async function getBillingOverview(
  context: TenantContext,
): Promise<BillingOverview> {
  const database = await getDatabase();
  const [profile, subscription, stores, members, products] = await Promise.all([
    database
      .collection<{
        tenantId: string;
        planKey: string;
        billingStatus?: string;
        billingSource?: string;
        billingInterval?: string;
        trialEndsAt?: Date;
        graceEndsAt?: Date;
        currentPeriodEndsAt?: Date;
        cancelAtPeriodEnd?: boolean;
        stripeSubscriptionId?: string;
      }>("tenantProfiles")
      .findOne(
        { tenantId: context.tenantId },
        {
          projection: {
            planKey: 1,
            billingStatus: 1,
            billingSource: 1,
            billingInterval: 1,
            trialEndsAt: 1,
            graceEndsAt: 1,
            currentPeriodEndsAt: 1,
            cancelAtPeriodEnd: 1,
            stripeSubscriptionId: 1,
          },
        },
      ),
    database
      .collection<{
        stripeSubscriptionId?: string;
        status: string;
        billingInterval?: string;
        periodEnd?: Date;
        cancelAtPeriodEnd?: boolean;
        updatedAt?: Date;
      }>("subscription")
      .find({ referenceId: context.tenantId })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(1)
      .next(),
    database.collection("stores").countDocuments({
      tenantId: context.tenantId,
      status: "active",
      deletedAt: { $exists: false },
    }),
    database
      .collection("member")
      .countDocuments({ organizationId: context.tenantId }),
    database.collection("products").countDocuments({
      tenantId: context.tenantId,
      deletedAt: { $exists: false },
    }),
  ]);
  if (!profile) throw new BillingOverviewError();
  const planKey = planKeySchema.parse(profile.planKey);
  const plan = plans[planKey];
  return {
    planKey,
    planName: plan.name,
    billingStatus: profile.billingStatus ?? subscription?.status ?? "unknown",
    billingSource: profile.billingSource ?? "unknown",
    billingInterval:
      profile.billingInterval ?? subscription?.billingInterval ?? null,
    trialEndsAt: profile.trialEndsAt?.toISOString() ?? null,
    graceEndsAt: profile.graceEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt:
      profile.currentPeriodEndsAt?.toISOString() ??
      subscription?.periodEnd?.toISOString() ??
      null,
    cancelAtPeriodEnd:
      profile.cancelAtPeriodEnd ?? subscription?.cancelAtPeriodEnd ?? false,
    hasStripeSubscription: Boolean(
      profile.stripeSubscriptionId ?? subscription?.stripeSubscriptionId,
    ),
    providerEnabled: isStripeBillingProviderEnabled(),
    configuredPlans: configuredBillingPlans(),
    usage: [
      {
        resource: "stores",
        label: "Active stores",
        used: stores,
        limit: plan.limits.stores,
      },
      {
        resource: "members",
        label: "Team members",
        used: members,
        limit: plan.limits.members,
      },
      {
        resource: "products",
        label: "Products",
        used: products,
        limit: plan.limits.products,
      },
    ],
  };
}
