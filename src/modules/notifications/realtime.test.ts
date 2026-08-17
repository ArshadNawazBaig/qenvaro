import { describe, expect, it } from "vitest";
import {
  notificationCreatedEventSchema,
  notificationReadEventSchema,
  realtimeTargetSchema,
} from "./realtime";

const notification = {
  id: "not_123",
  title: "Stock is running low",
  message: "One catalog item reached its reorder level.",
  severity: "warning",
  href: "/app/store/inventory/alerts",
  createdAt: "2026-08-17T18:00:00.000Z",
  read: false,
  source: "tenant",
};

describe("realtime notification contracts", () => {
  it("accepts a bounded application notification", () => {
    expect(
      notificationCreatedEventSchema.parse({ notification }),
    ).toMatchObject({ notification: { id: "not_123", read: false } });
  });

  it("rejects external notification destinations and unknown fields", () => {
    expect(() =>
      notificationCreatedEventSchema.parse({
        notification: { ...notification, href: "https://example.com" },
      }),
    ).toThrow();
    expect(() =>
      notificationReadEventSchema.parse({
        notificationId: "not_123",
        tenantId: "untrusted-tenant",
      }),
    ).toThrow();
  });

  it("requires an explicit tenant-scoped or platform target", () => {
    expect(
      realtimeTargetSchema.parse({
        kind: "user",
        tenantId: "tenant_123",
        userId: "user_123",
      }),
    ).toMatchObject({ kind: "user", tenantId: "tenant_123" });
    expect(() =>
      realtimeTargetSchema.parse({ kind: "user", userId: "user_123" }),
    ).toThrow();
  });
});
