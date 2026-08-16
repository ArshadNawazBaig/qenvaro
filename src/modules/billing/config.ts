import "server-only";

import { env } from "@/config/env";
import type { PlanKey } from "@/config/plans";

const prices: Record<
  Exclude<PlanKey, "enterprise">,
  { monthly?: string; annual?: string }
> = {
  starter: {
    monthly: env.STRIPE_STARTER_MONTHLY_PRICE_ID,
    annual: env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  },
  growth: {
    monthly: env.STRIPE_GROWTH_MONTHLY_PRICE_ID,
    annual: env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
  },
  business: {
    monthly: env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    annual: env.STRIPE_BUSINESS_ANNUAL_PRICE_ID,
  },
};

export function isStripeBillingProviderEnabled(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export function isStripePlanConfigured(
  planKey: Exclude<PlanKey, "enterprise">,
  annual: boolean,
): boolean {
  return Boolean(
    isStripeBillingProviderEnabled() &&
    (annual ? prices[planKey].annual : prices[planKey].monthly),
  );
}

export function configuredBillingPlans() {
  return {
    starter: {
      monthly: isStripePlanConfigured("starter", false),
      annual: isStripePlanConfigured("starter", true),
    },
    growth: {
      monthly: isStripePlanConfigured("growth", false),
      annual: isStripePlanConfigured("growth", true),
    },
    business: {
      monthly: isStripePlanConfigured("business", false),
      annual: isStripePlanConfigured("business", true),
    },
  } as const;
}
