"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createOpaqueId } from "@/lib/utils";
import { getDatabase } from "@/server/db/client";
import { publishNotificationRead } from "@/server/realtime/publisher";
import { canReadNotification } from "@/server/repositories/governance";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const idSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9_:-]+$/);

export async function markNotificationReadAction(
  tenantSlug: string,
  notificationId: string,
) {
  try {
    const context = await requireTenantContext(tenantSlug);
    const id = idSchema.parse(notificationId);
    if (!(await canReadNotification(context, id)))
      return {
        status: "error" as const,
        message: "That notification is unavailable.",
      };
    const database = await getDatabase();
    const result = await database
      .collection<{ _id: string } & Record<string, unknown>>(
        "notificationReads",
      )
      .updateOne(
        {
          tenantId: context.tenantId,
          userId: context.userId,
          notificationId: id,
        },
        {
          $setOnInsert: {
            _id: createOpaqueId("nread"),
            tenantId: context.tenantId,
            userId: context.userId,
            notificationId: id,
            readAt: new Date(),
          },
        },
        { upsert: true },
      );
    if (result.upsertedCount === 1) {
      publishNotificationRead(
        {
          kind: "user",
          tenantId: context.tenantId,
          userId: context.userId,
        },
        { notificationId: id },
      );
    }
    revalidatePath(`/app/${context.tenantSlug}`, "layout");
    return {
      status: "success" as const,
      message: "Notification marked as read.",
    };
  } catch {
    return {
      status: "error" as const,
      message: "The notification could not be updated.",
    };
  }
}
