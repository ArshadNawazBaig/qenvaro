import "server-only";
import { requirePermission } from "@/modules/permissions/permissions";
import { assertUsageAvailable } from "@/config/plans";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { env } from "@/config/env";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
type StringIdDocument = { _id: string } & Record<string, unknown>;

export interface CreateSimpleProductInput {
  name: string;
  sku: string;
  category: string;
  priceMinor: number;
  openingStock: number;
}

export class ProductService {
  async createSimple(
    context: TenantContext,
    input: CreateSimpleProductInput,
  ): Promise<{ id: string }> {
    requirePermission(context.permissions, "product:create");
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const productId = createOpaqueId("prd");
    const storeId = [...context.allowedStoreIds][0];
    if (!storeId)
      throw new Error(
        "Create or assign an authorized store before adding stock.",
      );
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        const profile = await database
          .collection<{
            planKey: string;
            currency: string;
            billingStatus?: string;
            trialEndsAt?: Date;
            graceEndsAt?: Date;
          }>("tenantProfiles")
          .findOne(
            { tenantId: context.tenantId },
            {
              session,
              projection: {
                planKey: 1,
                currency: 1,
                billingStatus: 1,
                trialEndsAt: 1,
                graceEndsAt: 1,
              },
            },
          );
        if (!profile) throw new Error("Tenant profile is missing.");
        const plan = requireTenantWriteEntitlement(profile);
        const usage = await database
          .collection("products")
          .countDocuments(
            { tenantId: context.tenantId, deletedAt: { $exists: false } },
            { session },
          );
        assertUsageAvailable(plan, "products", usage);
        const now = new Date();
        await database.collection<StringIdDocument>("products").insertOne(
          {
            _id: productId,
            tenantId: context.tenantId,
            name: input.name,
            subtitle: "Simple product",
            sku: input.sku,
            normalizedSku: input.sku.toUpperCase(),
            slug: input.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, ""),
            category: input.category,
            priceMinor: input.priceMinor,
            currency: profile.currency,
            stock: input.openingStock,
            reorderLevel: 5,
            status: "active",
            views: 0,
            revenueMinor: 0,
            imageTone: "slate",
            allowedStoreIds: [...context.allowedStoreIds],
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
            version: 1,
          },
          { session },
        );
        const variantId = `${productId}_default`;
        await database
          .collection<StringIdDocument>("productVariants")
          .insertOne(
            {
              _id: variantId,
              tenantId: context.tenantId,
              productId,
              name: "Default",
              sku: input.sku,
              normalizedSku: input.sku.toUpperCase(),
              priceMinor: input.priceMinor,
              currency: profile.currency,
              createdAt: now,
              updatedAt: now,
              createdBy: context.userId,
              updatedBy: context.userId,
              version: 1,
            },
            { session },
          );
        if (input.openingStock > 0) {
          await database
            .collection<StringIdDocument>("inventoryMovements")
            .insertOne(
              {
                _id: createOpaqueId("mov"),
                tenantId: context.tenantId,
                storeId,
                variantId,
                type: "opening_balance",
                quantityDelta: input.openingStock,
                occurredAt: now,
                idempotencyKey: `product-create:${productId}`,
                createdAt: now,
                createdBy: context.userId,
              },
              { session },
            );
          await database
            .collection<StringIdDocument>("inventoryLevels")
            .insertOne(
              {
                _id: createOpaqueId("lvl"),
                tenantId: context.tenantId,
                storeId,
                variantId,
                quantity: input.openingStock,
                version: 1,
                createdAt: now,
                updatedAt: now,
                updatedBy: context.userId,
              },
              { session },
            );
        }
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "product.created",
            entityType: "product",
            entityId: productId,
            requestId: context.requestId,
            summary: "Created a simple catalog product.",
            createdAt: now,
          },
          { session },
        );
      });
    });
    return { id: productId };
  }
}
