import type Stripe from "stripe";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { projectVerifiedStripeEvent } from "@/modules/billing/stripe-projection";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

function stripeEvent(
  id: string,
  type: Stripe.Event.Type,
  object: Record<string, unknown>,
  created: number,
): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2026-06-30.basil",
    created,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  } as unknown as Stripe.Event;
}

describe.skipIf(!enabled)("verified Stripe entitlement projection", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_billing_${suffix}`;
  const subscriptionId = `subscription_${suffix}`;
  const stripeSubscriptionId = `sub_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  const eventTime = Math.floor(
    new Date("2026-08-16T12:00:00.000Z").getTime() / 1000,
  );

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringDocument>("tenantProfiles").insertOne({
      _id: `profile_billing_${suffix}`,
      tenantId,
      slug: `billing-${suffix}`,
      businessName: "Billing Integration Retail",
      planKey: "starter",
      billingStatus: "trialing",
      billingSource: "signup_trial",
      trialEndsAt: new Date("2026-08-20T00:00:00.000Z"),
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringDocument>("subscription").insertOne({
      _id: subscriptionId,
      referenceId: tenantId,
      plan: "growth",
      status: "active",
      stripeCustomerId: `cus_${suffix}`,
      stripeSubscriptionId,
      billingInterval: "month",
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-09-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    await database.collection("billingEvents").deleteMany({ tenantId });
    await database.collection("webhookEvents").deleteMany({
      eventId: { $regex: suffix },
    });
    await database
      .collection<StringDocument>("subscription")
      .deleteOne({ _id: subscriptionId });
    await database.collection("tenantProfiles").deleteMany({ tenantId });
    await client.close();
  });

  it("projects active, past-due, canceled, ignored, and replayed events", async () => {
    const activeEvent = stripeEvent(
      `evt_active_${suffix}`,
      "customer.subscription.updated",
      { id: stripeSubscriptionId },
      eventTime,
    );
    await projectVerifiedStripeEvent(activeEvent);
    await projectVerifiedStripeEvent(activeEvent);
    let profile = await database
      .collection("tenantProfiles")
      .findOne({ tenantId });
    expect(profile).toMatchObject({
      planKey: "growth",
      billingStatus: "active",
      billingSource: "stripe_webhook",
      stripeSubscriptionId,
      lastBillingEventId: activeEvent.id,
    });
    expect(
      await database.collection("billingEvents").countDocuments({
        provider: "stripe",
        eventId: activeEvent.id,
      }),
    ).toBe(1);

    await database
      .collection("subscription")
      .updateOne({ _id: subscriptionId } as never, {
        $set: { status: "past_due", updatedAt: new Date() },
      });
    const pastDueEvent = stripeEvent(
      `evt_past_due_${suffix}`,
      "customer.subscription.updated",
      { id: stripeSubscriptionId },
      eventTime + 60,
    );
    await projectVerifiedStripeEvent(pastDueEvent);
    profile = await database.collection("tenantProfiles").findOne({ tenantId });
    expect(profile?.billingStatus).toBe("past_due");
    expect(profile?.graceEndsAt).toEqual(new Date("2026-08-23T12:01:00.000Z"));
    expect(requireTenantWriteEntitlement(profile as never)).toBe("growth");

    await database
      .collection("subscription")
      .updateOne({ _id: subscriptionId } as never, {
        $set: {
          status: "canceled",
          periodEnd: new Date(Date.now() + 86_400_000),
          endedAt: new Date(),
          updatedAt: new Date(),
        },
      });
    const canceledEvent = stripeEvent(
      `evt_canceled_${suffix}`,
      "customer.subscription.deleted",
      { id: stripeSubscriptionId },
      eventTime + 120,
    );
    await projectVerifiedStripeEvent(canceledEvent);
    profile = await database.collection("tenantProfiles").findOne({ tenantId });
    expect(profile?.billingStatus).toBe("canceled");
    expect(requireTenantWriteEntitlement(profile as never)).toBe("growth");

    const ignoredEvent = stripeEvent(
      `evt_ignored_${suffix}`,
      "invoice.payment_failed",
      { id: `in_${suffix}` },
      eventTime + 180,
    );
    await projectVerifiedStripeEvent(ignoredEvent);
    expect(
      await database.collection("webhookEvents").findOne({
        provider: "stripe",
        eventId: ignoredEvent.id,
      }),
    ).toMatchObject({ processingStatus: "ignored" });
  });

  it("does not let a Stripe event reactivate a platform-suspended tenant", async () => {
    await database
      .collection("tenantProfiles")
      .updateOne({ tenantId }, { $set: { billingStatus: "suspended" } });
    await database
      .collection("subscription")
      .updateOne({ _id: subscriptionId } as never, {
        $set: { status: "active", plan: "business", updatedAt: new Date() },
      });
    const event = stripeEvent(
      `evt_suspended_${suffix}`,
      "customer.subscription.updated",
      { id: stripeSubscriptionId },
      eventTime + 240,
    );
    await projectVerifiedStripeEvent(event);
    expect(
      await database.collection("tenantProfiles").findOne({ tenantId }),
    ).toMatchObject({
      planKey: "business",
      billingStatus: "suspended",
      lastBillingEventId: event.id,
    });
  });

  it("retains a verified failure record for safe webhook retries", async () => {
    const event = stripeEvent(
      `evt_missing_${suffix}`,
      "customer.subscription.updated",
      { id: `sub_missing_${suffix}` },
      eventTime + 300,
    );
    await expect(projectVerifiedStripeEvent(event)).rejects.toMatchObject({
      reason: "subscription_not_found",
    });
    expect(
      await database.collection("webhookEvents").findOne({
        provider: "stripe",
        eventId: event.id,
      }),
    ).toMatchObject({
      processingStatus: "failed",
      failureReason: "subscription_not_found",
    });
  });
});
