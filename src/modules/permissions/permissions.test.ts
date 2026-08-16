import { describe, expect, it } from "vitest";
import {
  hasPermission,
  requirePermission,
  resolvePermissions,
} from "./permissions";

describe("tenant permissions", () => {
  it("does not grant ownership or compensation capabilities to managers", () => {
    const permissions = resolvePermissions(["MANAGER"]);
    expect(hasPermission(permissions, "product:update")).toBe(true);
    expect(hasPermission(permissions, "tenant:transferOwnership")).toBe(false);
    expect(hasPermission(permissions, "compensation:read")).toBe(false);
  });
  it("fails closed", () => {
    expect(() =>
      requirePermission(resolvePermissions(["VIEWER"]), "inventory:adjust"),
    ).toThrow(/do not have permission/);
  });

  it("keeps subscription mutations owner-only", () => {
    const owner = resolvePermissions(["OWNER"]);
    const admin = resolvePermissions(["ADMIN"]);
    expect(hasPermission(owner, "billing:manage")).toBe(true);
    expect(hasPermission(admin, "billing:read")).toBe(true);
    expect(hasPermission(admin, "billing:manage")).toBe(false);
  });
});
