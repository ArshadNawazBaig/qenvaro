import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeNotificationProvider } from "./realtime-notification-provider";

const mocks = vi.hoisted(() => ({
  disconnect: vi.fn(),
  info: vi.fn(),
  io: vi.fn(),
  managerOn: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  socketHandlers: new Map<string, (event?: unknown) => void>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("sonner", () => ({ toast: { info: mocks.info } }));

vi.mock("socket.io-client", () => ({ io: mocks.io }));

describe("RealtimeNotificationProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.socketHandlers.clear();
    mocks.io.mockReturnValue({
      disconnect: mocks.disconnect,
      io: { on: mocks.managerOn },
      on: (event: string, handler: (payload?: unknown) => void) => {
        mocks.socketHandlers.set(event, handler);
      },
    });
  });

  afterEach(() => vi.useRealTimers());

  it("connects with tenant auth and refreshes for a valid notification", () => {
    render(
      <RealtimeNotificationProvider tenantSlug="northstar" enabled>
        <p>Workspace</p>
      </RealtimeNotificationProvider>,
    );

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(mocks.io).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/socket.io",
        auth: { tenantSlug: "northstar" },
        withCredentials: true,
      }),
    );

    act(() => {
      mocks.socketHandlers.get("notification:created")?.({
        notification: {
          id: "not_123",
          title: "Stock is running low",
          message: "One item reached its reorder level.",
          severity: "warning",
          href: "/app/northstar/inventory/alerts",
          createdAt: "2026-08-17T18:00:00.000Z",
          read: false,
          source: "tenant",
        },
      });
      vi.advanceTimersByTime(80);
    });

    expect(mocks.info).toHaveBeenCalledWith(
      "Stock is running low",
      expect.objectContaining({
        description: "One item reached its reorder level.",
      }),
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("ignores malformed events and does not connect in demo mode", () => {
    const { unmount } = render(
      <RealtimeNotificationProvider tenantSlug="northstar" enabled>
        <p>Live workspace</p>
      </RealtimeNotificationProvider>,
    );
    act(() => {
      mocks.socketHandlers.get("notification:created")?.({
        notification: { id: "not_123", title: "Incomplete" },
      });
      vi.advanceTimersByTime(80);
    });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    unmount();
    expect(mocks.disconnect).toHaveBeenCalledOnce();

    mocks.io.mockClear();
    render(
      <RealtimeNotificationProvider tenantSlug="demo" enabled={false}>
        <p>Demo workspace</p>
      </RealtimeNotificationProvider>,
    );
    expect(mocks.io).not.toHaveBeenCalled();
  });
});
