import "server-only";

import { z } from "zod";
import { planKeySchema, plans } from "@/config/plans";
import { requirePermission } from "@/modules/permissions/permissions";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

const pageSchema = z.coerce.number().int().min(1).max(10_000).catch(1);

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "critical";
  href: string | null;
  createdAt: string;
  read: boolean;
  source: "tenant" | "platform";
}

export async function getNotifications(
  context: TenantContext,
  pageValue: unknown,
) {
  const database = await getDatabase();
  const page = pageSchema.parse(pageValue);
  const pageSize = 20;
  const now = new Date();
  const [tenantNotifications, announcements, reads] = await Promise.all([
    database
      .collection<{
        _id: string;
        title: string;
        message: string;
        severity?: NotificationItem["severity"];
        href?: string;
        createdAt: Date;
      }>("notifications")
      .find(
        {
          tenantId: context.tenantId,
          $or: [
            { recipientUserId: context.userId },
            { audience: "all" },
            { recipientRoles: { $in: context.roles } },
          ],
        },
        {
          projection: {
            title: 1,
            message: 1,
            severity: 1,
            href: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .toArray(),
    database
      .collection<{
        _id: string;
        title: string;
        message: string;
        severity?: NotificationItem["severity"];
        href?: string;
        startsAt: Date;
        endsAt?: Date;
        status: string;
        createdAt: Date;
      }>("platformAnnouncements")
      .find(
        {
          status: "published",
          startsAt: { $lte: now },
          $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }],
        },
        {
          projection: {
            title: 1,
            message: 1,
            severity: 1,
            href: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1, _id: -1 })
      .limit(25)
      .toArray(),
    database
      .collection<{ notificationId: string }>("notificationReads")
      .find(
        { tenantId: context.tenantId, userId: context.userId },
        { projection: { notificationId: 1 } },
      )
      .limit(1000)
      .toArray(),
  ]);
  const readIds = new Set(reads.map((read) => read.notificationId));
  const combined: NotificationItem[] = [
    ...tenantNotifications.map((item) => ({
      id: item._id,
      title: item.title,
      message: item.message,
      severity: item.severity ?? ("info" as const),
      href: item.href || null,
      createdAt: item.createdAt.toISOString(),
      read: readIds.has(item._id),
      source: "tenant" as const,
    })),
    ...announcements.map((item) => ({
      id: item._id,
      title: item.title,
      message: item.message,
      severity: item.severity ?? ("info" as const),
      href: item.href || null,
      createdAt: item.createdAt.toISOString(),
      read: readIds.has(item._id),
      source: "platform" as const,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items: combined.slice((page - 1) * pageSize, page * pageSize),
    page,
    pages: Math.max(1, Math.ceil(combined.length / pageSize)),
    unread: combined.filter((item) => !item.read).length,
    total: combined.length,
  };
}

export async function canReadNotification(
  context: TenantContext,
  notificationId: string,
): Promise<boolean> {
  const database = await getDatabase();
  const now = new Date();
  const [tenant, announcement] = await Promise.all([
    database
      .collection<{ _id: string } & Record<string, unknown>>("notifications")
      .findOne(
        {
          _id: notificationId,
          tenantId: context.tenantId,
          $or: [
            { recipientUserId: context.userId },
            { audience: "all" },
            { recipientRoles: { $in: context.roles } },
          ],
        },
        { projection: { _id: 1 } },
      ),
    database
      .collection<{ _id: string } & Record<string, unknown>>(
        "platformAnnouncements",
      )
      .findOne(
        {
          _id: notificationId,
          status: "published",
          startsAt: { $lte: now },
          $or: [{ endsAt: { $exists: false } }, { endsAt: { $gt: now } }],
        },
        { projection: { _id: 1 } },
      ),
  ]);
  return Boolean(tenant || announcement);
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  summary: string;
  requestId: string;
  createdAt: string;
}

export async function getAuditLog(
  context: TenantContext,
  input: { page?: unknown; action?: unknown },
) {
  requirePermission(context.permissions, "audit:read");
  const database = await getDatabase();
  const profile = await database
    .collection<{ planKey: string }>("tenantProfiles")
    .findOne({ tenantId: context.tenantId }, { projection: { planKey: 1 } });
  if (!profile) throw new Error("Tenant profile is unavailable.");
  const plan = plans[planKeySchema.parse(profile.planKey)];
  if (!plan.features.has("advancedAudit"))
    return {
      enabled: false,
      planName: plan.name,
      items: [] as AuditLogItem[],
      page: 1,
      pages: 1,
      total: 0,
    };
  const page = pageSchema.parse(input.page);
  const action = z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9_.-]*$/)
    .catch("")
    .parse(input.action ?? "");
  const pageSize = 30;
  const filter = { tenantId: context.tenantId, ...(action ? { action } : {}) };
  const [records, total] = await Promise.all([
    database
      .collection<{
        _id: string;
        actorId?: string;
        action: string;
        entityType: string;
        entityId: string;
        summary?: string;
        requestId?: string;
        createdAt: Date;
      }>("auditLogs")
      .find(filter, {
        projection: {
          actorId: 1,
          action: 1,
          entityType: 1,
          entityId: 1,
          summary: 1,
          requestId: 1,
          createdAt: 1,
        },
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    database.collection("auditLogs").countDocuments(filter),
  ]);
  const actorIds = [
    ...new Set(
      records.flatMap((record) => (record.actorId ? [record.actorId] : [])),
    ),
  ];
  const users = actorIds.length
    ? await database
        .collection<{ _id: string; name: string }>("user")
        .find({ _id: { $in: actorIds } }, { projection: { name: 1 } })
        .toArray()
    : [];
  const names = new Map(users.map((user) => [user._id, user.name]));
  return {
    enabled: true,
    planName: plan.name,
    items: records.map((record) => ({
      id: record._id,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      actorName: record.actorId
        ? (names.get(record.actorId) ?? "Former member")
        : "System",
      summary: record.summary ?? "Sensitive operation recorded.",
      requestId: record.requestId ?? "Not recorded",
      createdAt: record.createdAt.toISOString(),
    })),
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
}
