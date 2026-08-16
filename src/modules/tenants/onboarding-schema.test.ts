import { describe, expect, it } from "vitest";
import { onboardingSchema } from "./onboarding-schema";

const validInput = {
  businessName: "Acme Retail",
  businessSlug: "acme-retail",
  storeName: "Main Store",
  storeCode: "main",
  planKey: "growth",
  currency: "USD",
  locale: "en-US",
  timezone: "Asia/Karachi",
} as const;

describe("onboardingSchema", () => {
  it("normalizes the store code while retaining a URL-safe tenant slug", () => {
    expect(onboardingSchema.parse(validInput)).toMatchObject({
      businessSlug: "acme-retail",
      storeCode: "MAIN",
    });
  });

  it("rejects unsafe slugs and invented timezones", () => {
    expect(
      onboardingSchema.safeParse({
        ...validInput,
        businessSlug: "Acme Retail/../../other",
        timezone: "Mars/Olympus",
      }).success,
    ).toBe(false);
  });

  it("does not permit enterprise to be self-provisioned", () => {
    expect(
      onboardingSchema.safeParse({ ...validInput, planKey: "enterprise" })
        .success,
    ).toBe(false);
  });
});
