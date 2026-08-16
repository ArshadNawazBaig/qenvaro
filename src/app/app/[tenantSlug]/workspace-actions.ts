"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createOpaqueId } from "@/lib/utils";
import { auth } from "@/server/auth/auth";
import { getDatabase } from "@/server/db/client";
import {
  assertStoreAccess,
  TenantNotFoundError,
} from "@/server/tenancy/context";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9-]+$/);
const storeIdSchema = z.string().trim().min(3).max(128);

export async function switchBusinessAction(targetTenantSlug: string) {
  const parsedSlug = slugSchema.safeParse(targetTenantSlug);
  if (!parsedSlug.success) throw new TenantNotFoundError();
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) throw new TenantNotFoundError();
  const database = await getDatabase();
  const profile = await database
    .collection<{ tenantId: string; slug: string }>("tenantProfiles")
    .findOne(
      { slug: parsedSlug.data },
      { projection: { tenantId: 1, slug: 1 } },
    );
  if (!profile) throw new TenantNotFoundError();
  const membership = await database
    .collection("member")
    .findOne(
      { organizationId: profile.tenantId, userId: session.user.id },
      { projection: { _id: 1 } },
    );
  if (!membership) throw new TenantNotFoundError();
  await auth.api.setActiveOrganization({
    headers: requestHeaders,
    body: { organizationId: profile.tenantId },
  });
  redirect(`/app/${profile.slug}`);
}

export async function switchStoreAction(tenantSlug: string, storeId: string) {
  const parsedSlug = slugSchema.safeParse(tenantSlug);
  const parsedStoreId = storeIdSchema.safeParse(storeId);
  if (!parsedSlug.success || !parsedStoreId.success)
    throw new TenantNotFoundError();
  const context = await requireTenantContext(parsedSlug.data);
  assertStoreAccess(context, parsedStoreId.data);
  const database = await getDatabase();
  const store = await database.collection<{ _id: string }>("stores").findOne(
    {
      _id: parsedStoreId.data,
      tenantId: context.tenantId,
      status: "active",
      deletedAt: { $exists: false },
    },
    { projection: { _id: 1 } },
  );
  if (!store) throw new TenantNotFoundError();
  const now = new Date();
  await database
    .collection<{ _id: string } & Record<string, unknown>>(
      "sessionStoreSelections",
    )
    .updateOne(
      { sessionId: context.sessionId, tenantId: context.tenantId },
      {
        $set: {
          storeId: parsedStoreId.data,
          membershipId: context.membershipId,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: createOpaqueId("store_selection"),
          sessionId: context.sessionId,
          tenantId: context.tenantId,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  await database
    .collection<{ _id: string } & Record<string, unknown>>("auditLogs")
    .insertOne({
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "workspace.store.selected",
      entityType: "store",
      entityId: parsedStoreId.data,
      requestId: context.requestId,
      summary: "Selected the active store for this session.",
      createdAt: now,
    });
  revalidatePath(`/app/${context.tenantSlug}`, "layout");
}
