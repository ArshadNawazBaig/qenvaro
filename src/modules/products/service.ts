import "server-only";
import type { ClientSession, Db } from "mongodb";
import { requirePermission } from "@/modules/permissions/permissions";
import { assertUsageAvailable } from "@/config/plans";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { InventoryService } from "@/modules/inventory/service";
import {
  createCategorySlug,
  normalizeCategoryName,
} from "@/modules/categories/schemas";
import {
  archiveProductSchema,
  updateProductSchema,
  type ArchiveProductInput,
  type UpdateProductInput,
} from "@/modules/products/schemas";
import { productTagIdsSchema } from "@/modules/tags/schemas";
import { unitIdSchema } from "@/modules/units/schemas";
import { ensureDefaultUnit } from "@/modules/units/service";
import { env } from "@/config/env";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";
type StringIdDocument = { _id: string } & Record<string, unknown>;

interface MutableProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  subtitle: string;
  sku: string;
  category: string;
  unitId?: string;
  tagIds?: string[];
  priceMinor: number;
  reorderLevel: number;
  status: "draft" | "active" | "archived";
  version: number;
  deletedAt?: Date;
}

interface MutableVariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  sku: string;
  normalizedSku: string;
  priceMinor: number;
  updatedAt: Date;
  updatedBy: string;
  productArchivedAt?: Date;
  version: number;
}

interface ProductCategoryDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  slug: string;
  description: string;
  status: "active" | "archived";
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt?: Date;
}

interface TenantBillingProfile {
  planKey: string;
  currency: string;
  operationSettings?: { defaultTaxRateBps?: number };
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

export interface CreateSimpleProductInput {
  name: string;
  sku: string;
  category: string;
  unitId?: string;
  priceMinor: number;
  openingStock: number;
  tagIds?: string[];
}

export class ProductNotFoundError extends Error {
  constructor() {
    super("The requested product was not found.");
    this.name = "ProductNotFoundError";
  }
}

export class ProductVersionConflictError extends Error {
  constructor() {
    super("This product changed after the page was loaded.");
    this.name = "ProductVersionConflictError";
  }
}

export class ProductArchivedError extends Error {
  constructor() {
    super("Archived products cannot be edited.");
    this.name = "ProductArchivedError";
  }
}

export class ProductCategoryUnavailableError extends Error {
  constructor() {
    super("Choose an active category from this tenant catalog.");
    this.name = "ProductCategoryUnavailableError";
  }
}

export class ProductTagUnavailableError extends Error {
  constructor() {
    super("Choose active tags from this tenant catalog.");
    this.name = "ProductTagUnavailableError";
  }
}

export class ProductUnitUnavailableError extends Error {
  constructor() {
    super("Choose an active unit from this tenant catalog.");
    this.name = "ProductUnitUnavailableError";
  }
}

async function requireWriteProfile(
  database: Db,
  tenantId: string,
  session: ClientSession,
): Promise<TenantBillingProfile> {
  const profile = await database
    .collection<TenantBillingProfile>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        session,
        projection: {
          planKey: 1,
          currency: 1,
          operationSettings: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new Error("Tenant profile is missing.");
  requireTenantWriteEntitlement(profile);
  return profile;
}

async function resolveProductCategory(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  requestedName: string,
  now: Date,
  createIfMissing: boolean,
): Promise<string> {
  const categories = database.collection<ProductCategoryDocument>("categories");
  const normalizedName = normalizeCategoryName(requestedName);
  const existing = await categories.findOne(
    {
      tenantId: context.tenantId,
      normalizedName,
      deletedAt: { $exists: false },
    },
    { session },
  );
  if (existing) {
    if (existing.status !== "active")
      throw new ProductCategoryUnavailableError();
    return existing.name;
  }
  if (!createIfMissing) throw new ProductCategoryUnavailableError();

  const categoryId = createOpaqueId("cat");
  await categories.insertOne(
    {
      _id: categoryId,
      tenantId: context.tenantId,
      name: requestedName,
      normalizedName,
      slug: createCategorySlug(requestedName, categoryId),
      description: "",
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: context.userId,
      updatedBy: context.userId,
    },
    { session },
  );
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: "category.created",
      entityType: "category",
      entityId: categoryId,
      requestId: context.requestId,
      summary: "Created a category while adding a catalog product.",
      changes: { after: { name: requestedName, status: "active" } },
      createdAt: now,
    },
    { session },
  );
  return requestedName;
}

async function resolveProductTags(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  untrustedTagIds: string[] | undefined,
): Promise<string[]> {
  const tagIds = productTagIdsSchema.parse(untrustedTagIds ?? []);
  if (tagIds.length === 0) return [];
  const matchingTags = await database
    .collection<StringIdDocument>("tags")
    .countDocuments(
      {
        _id: { $in: tagIds },
        tenantId: context.tenantId,
        status: "active",
        deletedAt: { $exists: false },
      },
      { session },
    );
  if (matchingTags !== tagIds.length) throw new ProductTagUnavailableError();
  return tagIds;
}

async function resolveProductUnit(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  requestedUnitId: string | undefined,
  now: Date,
): Promise<string> {
  const unitId = requestedUnitId
    ? unitIdSchema.parse(requestedUnitId)
    : await ensureDefaultUnit(database, session, context, now);
  const unit = await database.collection<{ _id: string }>("units").findOne(
    {
      _id: unitId,
      tenantId: context.tenantId,
      status: "active",
      deletedAt: { $exists: false },
    },
    { session, projection: { _id: 1 } },
  );
  if (!unit) throw new ProductUnitUnavailableError();
  return unitId;
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
        const profile = await requireWriteProfile(
          database,
          context.tenantId,
          session,
        );
        const plan = requireTenantWriteEntitlement(profile);
        const usage = await database
          .collection("products")
          .countDocuments(
            { tenantId: context.tenantId, deletedAt: { $exists: false } },
            { session },
          );
        assertUsageAvailable(plan, "products", usage);
        const now = new Date();
        const category = await resolveProductCategory(
          database,
          session,
          context,
          input.category,
          now,
          true,
        );
        const tagIds = await resolveProductTags(
          database,
          session,
          context,
          input.tagIds,
        );
        const unitId = await resolveProductUnit(
          database,
          session,
          context,
          input.unitId,
          now,
        );
        await database.collection<StringIdDocument>("products").insertOne(
          {
            _id: productId,
            tenantId: context.tenantId,
            name: input.name,
            subtitle: "Simple product",
            type: "simple",
            optionGroups: [],
            inventoryTracking: true,
            taxRateBps: profile.operationSettings?.defaultTaxRateBps ?? 0,
            sku: input.sku,
            normalizedSku: input.sku.toUpperCase(),
            slug: input.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, ""),
            category,
            unitId,
            tagIds,
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
              status: "active",
              isDefault: true,
              optionValues: [],
              optionSignature: "default",
              createdAt: now,
              updatedAt: now,
              createdBy: context.userId,
              updatedBy: context.userId,
              version: 1,
            },
            { session },
          );
        await new InventoryService().recordOpeningBalanceInTransaction(
          database,
          session,
          context,
          {
            productId,
            variantId,
            storeId,
            quantity: input.openingStock,
            idempotencyKey: `product-create:${productId}`,
            now,
          },
        );
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
            changes: { after: { category, tagIds, unitId } },
            createdAt: now,
          },
          { session },
        );
      });
    });
    return { id: productId };
  }

  async update(
    context: TenantContext,
    untrustedInput: UpdateProductInput,
  ): Promise<{ version: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateProductSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteProfile(database, context.tenantId, session);
        const products =
          database.collection<MutableProductDocument>("products");
        const existing = await products.findOne(
          {
            _id: input.productId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new ProductNotFoundError();
        if (existing.status === "archived") throw new ProductArchivedError();
        if (existing.version !== input.expectedVersion)
          throw new ProductVersionConflictError();

        const now = new Date();
        const category = await resolveProductCategory(
          database,
          session,
          context,
          input.category,
          now,
          false,
        );
        const tagIds = await resolveProductTags(
          database,
          session,
          context,
          input.tagIds,
        );
        const unitId = await resolveProductUnit(
          database,
          session,
          context,
          input.unitId ?? existing.unitId,
          now,
        );
        const update = await products.updateOne(
          {
            _id: input.productId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: { $ne: "archived" },
            deletedAt: { $exists: false },
          },
          {
            $set: {
              name: input.name,
              subtitle: input.subtitle,
              sku: input.sku,
              normalizedSku: input.sku.toUpperCase(),
              category,
              unitId,
              tagIds,
              priceMinor: input.priceMinor,
              reorderLevel: input.reorderLevel,
              status: input.status,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new ProductVersionConflictError();

        await database
          .collection<MutableVariantDocument>("productVariants")
          .updateOne(
            {
              _id: `${input.productId}_default`,
              tenantId: context.tenantId,
              productId: input.productId,
            },
            {
              $set: {
                sku: input.sku,
                normalizedSku: input.sku.toUpperCase(),
                priceMinor: input.priceMinor,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "product.updated",
            entityType: "product",
            entityId: input.productId,
            requestId: context.requestId,
            summary: "Updated catalog product details.",
            changes: {
              before: {
                name: existing.name,
                subtitle: existing.subtitle,
                sku: existing.sku,
                category: existing.category,
                unitId: existing.unitId ?? null,
                tagIds: existing.tagIds ?? [],
                priceMinor: existing.priceMinor,
                reorderLevel: existing.reorderLevel,
                status: existing.status,
              },
              after: {
                name: input.name,
                subtitle: input.subtitle,
                sku: input.sku,
                category,
                unitId,
                tagIds,
                priceMinor: input.priceMinor,
                reorderLevel: input.reorderLevel,
                status: input.status,
              },
            },
            createdAt: now,
          },
          { session },
        );
        return { version: input.expectedVersion + 1 };
      }),
    );
    if (!result) throw new Error("Product update did not complete.");
    return result;
  }

  async archive(
    context: TenantContext,
    untrustedInput: ArchiveProductInput,
  ): Promise<{ version: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "product:archive");
    const input = archiveProductSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteProfile(database, context.tenantId, session);
        const products =
          database.collection<MutableProductDocument>("products");
        const existing = await products.findOne(
          {
            _id: input.productId,
            tenantId: context.tenantId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new ProductNotFoundError();
        if (existing.status === "archived")
          return { version: existing.version, alreadyArchived: true };
        if (existing.version !== input.expectedVersion)
          throw new ProductVersionConflictError();

        const now = new Date();
        const update = await products.updateOne(
          {
            _id: input.productId,
            tenantId: context.tenantId,
            version: input.expectedVersion,
            status: { $ne: "archived" },
            deletedAt: { $exists: false },
          },
          {
            $set: {
              status: "archived",
              archivedAt: now,
              archivedBy: context.userId,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new ProductVersionConflictError();

        await database
          .collection<MutableVariantDocument>("productVariants")
          .updateMany(
            { tenantId: context.tenantId, productId: input.productId },
            {
              $set: {
                productArchivedAt: now,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        await database.collection<StringIdDocument>("auditLogs").insertOne(
          {
            _id: createOpaqueId("aud"),
            tenantId: context.tenantId,
            actorId: context.userId,
            action: "product.archived",
            entityType: "product",
            entityId: input.productId,
            requestId: context.requestId,
            summary: "Archived a catalog product without changing inventory.",
            changes: {
              before: { status: existing.status },
              after: { status: "archived" },
            },
            createdAt: now,
          },
          { session },
        );
        return {
          version: input.expectedVersion + 1,
          alreadyArchived: false,
        };
      }),
    );
    if (!result) throw new Error("Product archive did not complete.");
    return result;
  }
}
