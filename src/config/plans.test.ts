import { describe, expect, it } from "vitest";
import { assertUsageAvailable, hasPlanFeature, PlanLimitError } from "./plans";

describe("plan entitlements", () => {
  it("gates features centrally", () => {
    expect(hasPlanFeature("starter", "payroll")).toBe(false);
    expect(hasPlanFeature("growth", "payroll")).toBe(true);
  });
  it("rejects creation beyond the configured quota", () => {
    expect(() => assertUsageAvailable("starter", "products", 1_000)).toThrow(
      PlanLimitError,
    );
    expect(() =>
      assertUsageAvailable("starter", "products", 999),
    ).not.toThrow();
  });
});
