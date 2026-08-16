import { planKeySchema, type PlanKey } from "@/config/plans";

export interface BillingAccessProjection {
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
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
  throw new BillingAccessError();
}

export class BillingAccessError extends Error {
  constructor() {
    super("Billing access is read-only. Update the subscription to continue.");
    this.name = "BillingAccessError";
  }
}
