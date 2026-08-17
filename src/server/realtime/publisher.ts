import "server-only";

import {
  notificationCreatedEventSchema,
  notificationReadEventSchema,
  notificationRemovedEventSchema,
  realtimeTargetSchema,
  type NotificationCreatedEvent,
  type NotificationReadEvent,
  type NotificationRemovedEvent,
  type RealtimeTarget,
} from "@/modules/notifications/realtime";

interface RealtimePublication {
  event: "notification:created" | "notification:read" | "notification:removed";
  target: RealtimeTarget;
  payload:
    NotificationCreatedEvent | NotificationReadEvent | NotificationRemovedEvent;
}

type RealtimePublisher = (publication: RealtimePublication) => boolean;

interface RealtimeGlobal {
  __qenvaroRealtimePublish?: RealtimePublisher;
}

function publish(publication: RealtimePublication): boolean {
  return (
    (
      globalThis as typeof globalThis & RealtimeGlobal
    ).__qenvaroRealtimePublish?.(publication) ?? false
  );
}

export function publishNotificationCreated(
  target: RealtimeTarget,
  payload: NotificationCreatedEvent,
): boolean {
  return publish({
    event: "notification:created",
    target: realtimeTargetSchema.parse(target),
    payload: notificationCreatedEventSchema.parse(payload),
  });
}

export function publishNotificationRead(
  target: RealtimeTarget,
  payload: NotificationReadEvent,
): boolean {
  return publish({
    event: "notification:read",
    target: realtimeTargetSchema.parse(target),
    payload: notificationReadEventSchema.parse(payload),
  });
}

export function publishNotificationRemoved(
  target: RealtimeTarget,
  payload: NotificationRemovedEvent,
): boolean {
  return publish({
    event: "notification:removed",
    target: realtimeTargetSchema.parse(target),
    payload: notificationRemovedEventSchema.parse(payload),
  });
}
