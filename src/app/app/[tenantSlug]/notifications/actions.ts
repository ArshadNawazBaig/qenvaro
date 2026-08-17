"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createOpaqueId } from "@/lib/utils";
import { getDatabase } from "@/server/db/client";
import { logger } from "@/server/logging/logger";
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
  const parsedId = idSchema.safeParse(notificationId);
  if (!parsedId.success)
    return {
      status: "error" as const,
      message: "That notification is unavailable.",
    };

  if (tenantSlug === "demo")
    return {
      status: "success" as const,
      message: "Notification marked as read.",
    };

  let context;
  try {
    context = await requireTenantContext(tenantSlug);
  } catch (error) {
    logger.warn({
      event: "notification.read.context_failed",
      tenantSlug,
      err: error,
    });
    return {
      status: "error" as const,
      message: "Your session expired. Refresh the page and sign in again.",
    };
  }

  const id = parsedId.data;
  try {
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
      try {
        publishNotificationRead(
          {
            kind: "user",
            tenantId: context.tenantId,
            userId: context.userId,
          },
          { notificationId: id },
        );
      } catch (error) {
        logger.warn({
          event: "notification.read.realtime_publish_failed",
          tenantId: context.tenantId,
          userId: context.userId,
          requestId: context.requestId,
          err: error,
        });
      }
    }

    try {
      revalidatePath(`/app/${context.tenantSlug}`, "layout");
    } catch (error) {
      logger.warn({
        event: "notification.read.revalidation_failed",
        tenantId: context.tenantId,
        userId: context.userId,
        requestId: context.requestId,
        err: error,
      });
    }
  } catch (error) {
    logger.error({
      event: "notification.read.persistence_failed",
      tenantId: context.tenantId,
      userId: context.userId,
      requestId: context.requestId,
      err: error,
    });
    return {
      status: "error" as const,
      message: "The notification could not be updated.",
    };
  }

  return {
    status: "success" as const,
    message: "Notification marked as read.",
  };
}
