import { describe, expect, it } from "vitest";
import { hasAllStoreAccess } from "./store-access";

describe("store access policy", () => {
  it("always gives owners access to every active store", () => {
    expect(hasAllStoreAccess(["OWNER"], 1)).toBe(true);
    expect(hasAllStoreAccess(["owner"], 4)).toBe(true);
  });

  it("gives unscoped admins access to every active store", () => {
    expect(hasAllStoreAccess(["ADMIN"], 0)).toBe(true);
    expect(hasAllStoreAccess(["ADMIN"], 1)).toBe(false);
  });

  it("keeps other roles limited to explicit assignments", () => {
    expect(hasAllStoreAccess(["MANAGER"], 0)).toBe(false);
    expect(hasAllStoreAccess(["VIEWER"], 2)).toBe(false);
  });
});
