import {
  hasPlanFeature,
  planKeySchema,
  type PlanFeature,
  type PlanKey,
} from "@/config/plans";

export interface BillingAccessProjection {
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

export function requireTenantWriteEntitlement(
  projection: BillingAccessProjection,
  now = new Date(),
): PlanKey {
  const planKey = planKeySchema.parse(projection.planKey);
  if (projection.billingStatus === "active") return planKey;
  if (
    projection.billingStatus === "trialing" &&
    projection.trialEndsAt instanceof Date &&
    projection.trialEndsAt > now
  )
    return planKey;
  if (
    projection.billingStatus === "past_due" &&
    projection.graceEndsAt instanceof Date &&
    projection.graceEndsAt > now
  )
    return planKey;
  if (
    projection.billingStatus === "canceled" &&
    projection.currentPeriodEndsAt instanceof Date &&
    projection.currentPeriodEndsAt > now
  )
    return planKey;
  throw new BillingAccessError();
}

export class BillingAccessError extends Error {
  constructor() {
    super("Billing access is read-only. Update the subscription to continue.");
    this.name = "BillingAccessError";
  }
}

export function requireFeature(plan: PlanKey, feature: PlanFeature): void {
  if (!hasPlanFeature(plan, feature)) throw new FeatureAccessError(feature);
}

export class FeatureAccessError extends Error {
  constructor(public readonly feature: PlanFeature) {
    super(`The ${feature} feature is not included in this plan.`);
    this.name = "FeatureAccessError";
  }
}
