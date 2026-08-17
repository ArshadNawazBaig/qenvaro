import { beforeEach, describe, expect, it, vi } from "vitest";
import { markNotificationReadAction } from "./actions";

const mocks = vi.hoisted(() => ({
  canReadNotification: vi.fn(),
  getDatabase: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  publishNotificationRead: vi.fn(),
  requireTenantContext: vi.fn(),
  revalidatePath: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/logging/logger", () => ({
  logger: { error: mocks.loggerError, warn: mocks.loggerWarn },
}));
vi.mock("@/server/realtime/publisher", () => ({
  publishNotificationRead: mocks.publishNotificationRead,
}));
vi.mock("@/server/repositories/governance", () => ({
  canReadNotification: mocks.canReadNotification,
}));
vi.mock("@/server/tenancy/resolve-context", () => ({
  requireTenantContext: mocks.requireTenantContext,
}));

describe("markNotificationReadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireTenantContext.mockResolvedValue({
      tenantId: "tenant_123",
      tenantSlug: "northstar-goods",
      userId: "user_123",
      requestId: "request_123",
    });
    mocks.canReadNotification.mockResolvedValue(true);
    mocks.updateOne.mockResolvedValue({ upsertedCount: 1 });
    mocks.getDatabase.mockResolvedValue({
      collection: () => ({ updateOne: mocks.updateOne }),
    });
  });

  it("marks a live notification read and invalidates the workspace layout", async () => {
    await expect(
      markNotificationReadAction("northstar-goods", "not_123"),
    ).resolves.toEqual({
      status: "success",
      message: "Notification marked as read.",
    });

    expect(mocks.updateOne).toHaveBeenCalledOnce();
    expect(mocks.publishNotificationRead).toHaveBeenCalledWith(
      { kind: "user", tenantId: "tenant_123", userId: "user_123" },
      { notificationId: "not_123" },
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/app/northstar-goods",
      "layout",
    );
  });

  it("does not report a persisted read as failed when realtime delivery fails", async () => {
    mocks.publishNotificationRead.mockImplementationOnce(() => {
      throw new Error("Socket unavailable");
    });

    await expect(
      markNotificationReadAction("northstar-goods", "not_123"),
    ).resolves.toMatchObject({ status: "success" });
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "notification.read.realtime_publish_failed",
      }),
    );
  });

  it("handles demo notification reads without requiring a live session", async () => {
    await expect(
      markNotificationReadAction("demo", "demo-low-stock"),
    ).resolves.toMatchObject({ status: "success" });
    expect(mocks.requireTenantContext).not.toHaveBeenCalled();
    expect(mocks.updateOne).not.toHaveBeenCalled();
  });
});
