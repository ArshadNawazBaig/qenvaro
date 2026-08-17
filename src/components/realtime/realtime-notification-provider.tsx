"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { io, type Socket } from "socket.io-client";
import {
  notificationCreatedEventSchema,
  notificationReadEventSchema,
  notificationRemovedEventSchema,
  type NotificationServerToClientEvents,
} from "@/modules/notifications/realtime";

type RealtimeStatus = "disabled" | "connecting" | "connected" | "reconnecting";

export function RealtimeNotificationProvider({
  tenantSlug,
  enabled,
  children,
}: {
  tenantSlug: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout>>(null);
  const [connectionStatus, setConnectionStatus] =
    React.useState<Exclude<RealtimeStatus, "disabled">>("connecting");
  const status: RealtimeStatus = enabled ? connectionStatus : "disabled";

  const refreshWorkspace = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      React.startTransition(() => router.refresh());
    }, 80);
  }, [router]);

  React.useEffect(() => {
    if (!enabled) return;

    const socket: Socket<NotificationServerToClientEvents> = io({
      path: "/socket.io",
      withCredentials: true,
      auth: { tenantSlug },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });

    socket.on("connect", () => setConnectionStatus("connected"));
    socket.on("disconnect", () => setConnectionStatus("reconnecting"));
    socket.on("connect_error", () => setConnectionStatus("reconnecting"));
    socket.io.on("reconnect_attempt", () =>
      setConnectionStatus("reconnecting"),
    );
    socket.on("notification:created", (untrustedEvent) => {
      const parsed = notificationCreatedEventSchema.safeParse(untrustedEvent);
      if (!parsed.success) return;
      const notification = parsed.data.notification;
      const notificationHref = notification.href;
      toast.info(notification.title, {
        description: notification.message,
        action: notificationHref
          ? {
              label: "Open",
              onClick: () => router.push(notificationHref),
            }
          : undefined,
      });
      refreshWorkspace();
    });
    socket.on("notification:read", (untrustedEvent) => {
      if (!notificationReadEventSchema.safeParse(untrustedEvent).success)
        return;
      refreshWorkspace();
    });
    socket.on("notification:removed", (untrustedEvent) => {
      if (!notificationRemovedEventSchema.safeParse(untrustedEvent).success)
        return;
      refreshWorkspace();
    });

    return () => {
      socket.disconnect();
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [enabled, refreshWorkspace, router, tenantSlug]);

  return (
    <>
      {children}
      <span className="sr-only" role="status" aria-live="polite">
        {status === "connected"
          ? "Real-time notifications connected."
          : status === "reconnecting"
            ? "Real-time notifications reconnecting."
            : ""}
      </span>
    </>
  );
}
