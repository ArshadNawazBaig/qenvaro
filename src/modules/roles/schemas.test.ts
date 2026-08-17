import { describe, expect, it } from "vitest";
import { createCustomRoleSchema } from "./schemas";

describe("custom role boundaries", () => {
  it("deduplicates operational permissions", () => {
    expect(
      createCustomRoleSchema.parse({
        name: "Receiving lead",
        description: "Receives approved purchases.",
        permissions: ["purchase:read", "purchase:receive", "purchase:read"],
      }).permissions,
    ).toEqual(["purchase:read", "purchase:receive"]);
  });

  it("rejects owner, billing, membership, and settings escalation", () => {
    expect(() =>
      createCustomRoleSchema.parse({
        name: "Unsafe",
        description: "Attempts a protected capability.",
        permissions: ["tenant:delete"],
      }),
    ).toThrow();
  });
});
