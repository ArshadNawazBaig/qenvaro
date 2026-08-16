import { describe, expect, it } from "vitest";
import {
  evaluatePlatformAccess,
  hasPlatformSuperAdminRole,
} from "./access-policy";

describe("platform access policy", () => {
  it("requires the exact global platform role", () => {
    expect(hasPlatformSuperAdminRole("PLATFORM_SUPER_ADMIN")).toBe(true);
    expect(hasPlatformSuperAdminRole("user,PLATFORM_SUPER_ADMIN")).toBe(true);
    expect(hasPlatformSuperAdminRole("platform_super_admin")).toBe(false);
    expect(hasPlatformSuperAdminRole("owner")).toBe(false);
  });

  it("requires both enrollment and assurance for the current session", () => {
    expect(
      evaluatePlatformAccess({
        role: "user",
        twoFactorEnabled: true,
        sessionAssured: true,
      }),
    ).toBe("deny");
    expect(
      evaluatePlatformAccess({
        role: "PLATFORM_SUPER_ADMIN",
        twoFactorEnabled: false,
        sessionAssured: false,
      }),
    ).toBe("require_two_factor_enrollment");
    expect(
      evaluatePlatformAccess({
        role: "PLATFORM_SUPER_ADMIN",
        twoFactorEnabled: true,
        sessionAssured: false,
      }),
    ).toBe("require_two_factor_verification");
    expect(
      evaluatePlatformAccess({
        role: "PLATFORM_SUPER_ADMIN",
        twoFactorEnabled: true,
        sessionAssured: true,
      }),
    ).toBe("allow");
  });
});
