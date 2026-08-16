import { describe, expect, it } from "vitest";
import {
  BillingAccessError,
  requireTenantWriteEntitlement,
} from "./entitlements";

const now = new Date("2026-08-16T12:00:00.000Z");

describe("requireTenantWriteEntitlement", () => {
  it("allows an active subscription and a current signup trial", () => {
    expect(
      requireTenantWriteEntitlement(
        { planKey: "starter", billingStatus: "active" },
        now,
      ),
    ).toBe("starter");
    expect(
      requireTenantWriteEntitlement(
        {
          planKey: "growth",
          billingStatus: "trialing",
          trialEndsAt: new Date("2026-08-17T00:00:00.000Z"),
        },
        now,
      ),
    ).toBe("growth");
  });

  it("moves expired, canceled, and suspended tenants to read-only access", () => {
    for (const projection of [
      {
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date("2026-08-15T00:00:00.000Z"),
      },
      { planKey: "growth", billingStatus: "canceled" },
      { planKey: "growth", billingStatus: "suspended" },
    ])
      expect(() => requireTenantWriteEntitlement(projection, now)).toThrow(
        BillingAccessError,
      );
  });
});
