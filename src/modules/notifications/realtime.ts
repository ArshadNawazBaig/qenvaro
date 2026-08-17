import { z } from "zod";

const realtimeIdSchema = z.string().trim().min(1).max(128);

export const realtimeNotificationSchema = z
  .object({
    id: realtimeIdSchema,
    title: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(1000),
    severity: z.enum(["info", "success", "warning", "critical"]),
    href: z
      .string()
      .trim()
      .max(240)
      .refine((value) => value.startsWith("/"), "Use an application path.")
      .nullable(),
    createdAt: z.iso.datetime(),
    read: z.literal(false),
    source: z.enum(["tenant", "platform"]),
  })
  .strict();

export const notificationCreatedEventSchema = z
  .object({ notification: realtimeNotificationSchema })
  .strict();

export const notificationReadEventSchema = z
  .object({ notificationId: realtimeIdSchema })
  .strict();

export const notificationRemovedEventSchema = z
  .object({ notificationId: realtimeIdSchema })
  .strict();

export const realtimeTargetSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("user"),
      tenantId: realtimeIdSchema,
      userId: realtimeIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal("tenant"), tenantId: realtimeIdSchema }).strict(),
  z
    .object({
      kind: z.literal("roles"),
      tenantId: realtimeIdSchema,
      roles: z.array(realtimeIdSchema).min(1).max(20),
    })
    .strict(),
  z.object({ kind: z.literal("platform") }).strict(),
]);

export type RealtimeNotification = z.infer<typeof realtimeNotificationSchema>;
export type NotificationCreatedEvent = z.infer<
  typeof notificationCreatedEventSchema
>;
export type NotificationReadEvent = z.infer<typeof notificationReadEventSchema>;
export type NotificationRemovedEvent = z.infer<
  typeof notificationRemovedEventSchema
>;
export type RealtimeTarget = z.infer<typeof realtimeTargetSchema>;

export type RealtimeNotificationEvent =
  | { name: "notification:created"; payload: NotificationCreatedEvent }
  | { name: "notification:read"; payload: NotificationReadEvent }
  | { name: "notification:removed"; payload: NotificationRemovedEvent };

export interface NotificationServerToClientEvents {
  "notification:created": (event: NotificationCreatedEvent) => void;
  "notification:read": (event: NotificationReadEvent) => void;
  "notification:removed": (event: NotificationRemovedEvent) => void;
}
