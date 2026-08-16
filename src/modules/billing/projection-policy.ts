import { planKeySchema, type PlanKey } from "@/config/plans";

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StripeSubscriptionProjectionInput {
  referenceId: string;
  plan: string;
  status: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  billingInterval?: string;
  periodStart?: Date;
  periodEnd?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  cancelAt?: Date;
  canceledAt?: Date;
  endedAt?: Date;
}

export interface ExistingTenantBillingProjection {
  billingStatus?: string;
  stripeSubscriptionId?: string;
  graceEndsAt?: Date;
}

export interface DerivedTenantBillingProjection {
  planKey: PlanKey;
  billingStatus: string;
  graceEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  billingInterval: string | null;
  currentPeriodStartsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
}

export class BillingProjectionError extends Error {
  constructor(
    public readonly reason:
      "subscription_not_found" | "tenant_not_found" | "unsupported_plan",
  ) {
    super("The verified billing event could not be projected.");
    this.name = "BillingProjectionError";
  }
}

export function deriveTenantBillingProjection(
  subscription: StripeSubscriptionProjectionInput,
  existing: ExistingTenantBillingProjection,
  occurredAt: Date,
): DerivedTenantBillingProjection {
  const parsedPlan = planKeySchema.safeParse(subscription.plan.toLowerCase());
  if (!parsedPlan.success) throw new BillingProjectionError("unsupported_plan");
  const samePastDueSubscription =
    existing.billingStatus === "past_due" &&
    existing.stripeSubscriptionId === subscription.stripeSubscriptionId &&
    existing.graceEndsAt instanceof Date;
  const graceEndsAt =
    subscription.status === "past_due"
      ? samePastDueSubscription
        ? existing.graceEndsAt!
        : new Date(occurredAt.getTime() + PAST_DUE_GRACE_MS)
      : null;
  return {
    planKey: parsedPlan.data,
    billingStatus: subscription.status,
    graceEndsAt,
    stripeSubscriptionId: subscription.stripeSubscriptionId ?? null,
    stripeCustomerId: subscription.stripeCustomerId ?? null,
    billingInterval: subscription.billingInterval ?? null,
    currentPeriodStartsAt: subscription.periodStart ?? null,
    currentPeriodEndsAt: subscription.periodEnd ?? null,
    trialStartsAt: subscription.trialStart ?? null,
    trialEndsAt: subscription.trialEnd ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    cancelAt: subscription.cancelAt ?? null,
    canceledAt: subscription.canceledAt ?? null,
    endedAt: subscription.endedAt ?? null,
  };
}
