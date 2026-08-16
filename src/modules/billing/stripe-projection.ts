import "server-only";

import type Stripe from "stripe";
import { env } from "@/config/env";
import { planKeySchema, type PlanKey } from "@/config/plans";
import { createOpaqueId } from "@/lib/utils";
import { getMongoClient } from "@/server/db/client";

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
type StringDocument = { _id: string } & Record<string, unknown>;

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

function subscriptionIdFromEvent(event: Stripe.Event): string | null {
  if (event.type.startsWith("customer.subscription."))
    return (event.data.object as Stripe.Subscription).id;
  if (event.type === "checkout.session.completed") {
    const subscription = (event.data.object as Stripe.Checkout.Session)
      .subscription;
    return typeof subscription === "string"
      ? subscription
      : (subscription?.id ?? null);
  }
  return null;
}

export async function projectVerifiedStripeEvent(
  event: Stripe.Event,
): Promise<void> {
  const client = await getMongoClient();
  const database = client.db(env.MONGODB_DATABASE);
  const occurredAt = new Date(event.created * 1000);
  const stripeSubscriptionId = subscriptionIdFromEvent(event);

  await client.withSession(async (session) => {
    await session.withTransaction(async () => {
      const existingEvent = await database
        .collection<{ processedAt?: Date }>("webhookEvents")
        .findOne(
          { provider: "stripe", eventId: event.id },
          { session, projection: { processedAt: 1 } },
        );
      if (existingEvent?.processedAt) return;

      const verifiedRecord = {
        provider: "stripe",
        eventId: event.id,
        type: event.type,
        livemode: event.livemode,
        occurredAt,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      };
      if (!stripeSubscriptionId) {
        await database.collection<StringDocument>("webhookEvents").updateOne(
          { provider: "stripe", eventId: event.id },
          {
            $set: {
              ...verifiedRecord,
              processingStatus: "ignored",
              processedAt: new Date(),
            },
            $setOnInsert: {
              _id: createOpaqueId("wh"),
              createdAt: new Date(),
            },
          },
          { session, upsert: true },
        );
        return;
      }

      const subscription = await database
        .collection<StripeSubscriptionProjectionInput>("subscription")
        .findOne(
          { stripeSubscriptionId },
          {
            session,
            projection: {
              referenceId: 1,
              plan: 1,
              status: 1,
              stripeCustomerId: 1,
              stripeSubscriptionId: 1,
              billingInterval: 1,
              periodStart: 1,
              periodEnd: 1,
              trialStart: 1,
              trialEnd: 1,
              cancelAtPeriodEnd: 1,
              cancelAt: 1,
              canceledAt: 1,
              endedAt: 1,
            },
          },
        );
      if (!subscription)
        throw new BillingProjectionError("subscription_not_found");
      const profile = await database
        .collection<
          ExistingTenantBillingProjection & {
            tenantId: string;
            billingStatus?: string;
          }
        >("tenantProfiles")
        .findOne(
          { tenantId: subscription.referenceId },
          {
            session,
            projection: {
              tenantId: 1,
              billingStatus: 1,
              stripeSubscriptionId: 1,
              graceEndsAt: 1,
            },
          },
        );
      if (!profile) throw new BillingProjectionError("tenant_not_found");
      const projection = deriveTenantBillingProjection(
        subscription,
        profile,
        occurredAt,
      );
      const billingStatus =
        profile.billingStatus === "suspended"
          ? "suspended"
          : projection.billingStatus;
      const now = new Date();
      await database.collection("tenantProfiles").updateOne(
        { tenantId: subscription.referenceId },
        {
          $set: {
            ...projection,
            billingStatus,
            billingSource: "stripe_webhook",
            lastBillingEventId: event.id,
            billingUpdatedAt: now,
            updatedAt: now,
          },
        },
        { session },
      );
      await database.collection<StringDocument>("billingEvents").insertOne(
        {
          _id: createOpaqueId("bill_evt"),
          tenantId: subscription.referenceId,
          provider: "stripe",
          eventId: event.id,
          type: event.type,
          subscriptionStatus: projection.billingStatus,
          planKey: projection.planKey,
          occurredAt,
          createdAt: now,
        },
        { session },
      );
      await database.collection<StringDocument>("webhookEvents").updateOne(
        { provider: "stripe", eventId: event.id },
        {
          $set: {
            ...verifiedRecord,
            tenantId: subscription.referenceId,
            resourceId: stripeSubscriptionId,
            processingStatus: "processed",
            processedAt: now,
          },
          $setOnInsert: {
            _id: createOpaqueId("wh"),
            createdAt: now,
          },
        },
        { session, upsert: true },
      );
    });
  });
}
