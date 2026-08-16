import { describe, expect, it } from "vitest";
import { inviteMemberSchema, updateMemberSchema } from "./schemas";

describe("member management schemas", () => {
  it("normalizes email and de-duplicates store assignments", () => {
    expect(
      inviteMemberSchema.parse({
        email: "  TEAM@example.test ",
        role: "cashier",
        storeIds: ["store_main", "store_main", "store_second"],
      }),
    ).toEqual({
      email: "team@example.test",
      role: "cashier",
      storeIds: ["store_main", "store_second"],
    });
  });

  it("does not permit assigning the owner role", () => {
    expect(
      inviteMemberSchema.safeParse({
        email: "team@example.test",
        role: "owner",
        storeIds: ["store_main"],
      }).success,
    ).toBe(false);
  });

  it("requires at least one explicit store for non-owner access", () => {
    expect(
      updateMemberSchema.safeParse({
        memberId: "member_one",
        role: "viewer",
        storeIds: [],
      }).success,
    ).toBe(false);
  });
});
