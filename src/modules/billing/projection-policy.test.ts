import { describe, expect, it } from "vitest";
import {
  BillingProjectionError,
  deriveTenantBillingProjection,
  type StripeSubscriptionProjectionInput,
} from "./projection-policy";

const occurredAt = new Date("2026-08-16T12:00:00.000Z");
const subscription: StripeSubscriptionProjectionInput = {
  referenceId: "tenant_one",
  plan: "growth",
  status: "active",
  stripeCustomerId: "cus_one",
  stripeSubscriptionId: "sub_one",
  billingInterval: "month",
  periodStart: new Date("2026-08-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-01T00:00:00.000Z"),
};

describe("deriveTenantBillingProjection", () => {
  it("projects verified subscription fields without payment data", () => {
    expect(
      deriveTenantBillingProjection(subscription, {}, occurredAt),
    ).toMatchObject({
      planKey: "growth",
      billingStatus: "active",
      stripeCustomerId: "cus_one",
      stripeSubscriptionId: "sub_one",
      billingInterval: "month",
      currentPeriodEndsAt: new Date("2026-09-01T00:00:00.000Z"),
      graceEndsAt: null,
    });
  });

  it("starts one seven-day past-due grace period and does not extend it", () => {
    const first = deriveTenantBillingProjection(
      { ...subscription, status: "past_due" },
      {},
      occurredAt,
    );
    expect(first.graceEndsAt).toEqual(new Date("2026-08-23T12:00:00.000Z"));
    const replayedUpdate = deriveTenantBillingProjection(
      { ...subscription, status: "past_due" },
      {
        billingStatus: "past_due",
        stripeSubscriptionId: "sub_one",
        graceEndsAt: first.graceEndsAt!,
      },
      new Date("2026-08-20T12:00:00.000Z"),
    );
    expect(replayedUpdate.graceEndsAt).toEqual(first.graceEndsAt);
  });

  it("rejects a Stripe plan that is absent from the server plan catalog", () => {
    expect(() =>
      deriveTenantBillingProjection(
        { ...subscription, plan: "forged-enterprise-plus" },
        {},
        occurredAt,
      ),
    ).toThrow(BillingProjectionError);
  });
});
