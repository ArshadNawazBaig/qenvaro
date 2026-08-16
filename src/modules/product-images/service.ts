import "server-only";
import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import {
  attachProductImageSchema,
  MAX_PRODUCT_IMAGES,
  moveProductImageSchema,
  productImageMutationSchema,
  updateProductImageAltSchema,
  type AttachProductImageInput,
  type MoveProductImageInput,
  type ProductImageMutationInput,
  type UpdateProductImageAltInput,
} from "@/modules/product-images/schemas";
import { requirePermission } from "@/modules/permissions/permissions";
import { getDatabase, getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface ProductImageProductDocument {
  _id: string;
  tenantId: string;
  status: "draft" | "active" | "archived";
  version: number;
  deletedAt?: Date;
}

interface ProductImageDocument {
  _id: string;
  tenantId: string;
  productId: string;
  cloudinaryPublicId: string;
  cloudinaryAssetId: string;
  cloudinaryVersion: number;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  altText: string;
  position: number;
  isPrimary: boolean;
  status: "active" | "archived";
  cleanupStatus: "not_required" | "pending" | "complete";
  cleanupAttempts: number;
  cleanupError?: string;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  archivedAt?: Date;
  archivedBy?: string;
}

interface TenantBillingProfile {
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

export class ProductImageNotFoundError extends Error {
  constructor() {
    super("The requested product image was not found.");
    this.name = "ProductImageNotFoundError";
  }
}

export class ProductImageProductNotFoundError extends Error {
  constructor() {
    super("The requested product was not found.");
    this.name = "ProductImageProductNotFoundError";
  }
}

export class ProductImageProductArchivedError extends Error {
  constructor() {
    super("Archived products cannot change images.");
    this.name = "ProductImageProductArchivedError";
  }
}

export class ProductImageVersionConflictError extends Error {
  constructor() {
    super("This product image changed after the page was loaded.");
    this.name = "ProductImageVersionConflictError";
  }
}

export class ProductImageLimitError extends Error {
  constructor() {
    super(`A product can have at most ${MAX_PRODUCT_IMAGES} images.`);
    this.name = "ProductImageLimitError";
  }
}

async function requireWriteAccess(
  database: Db,
  tenantId: string,
  session?: ClientSession,
): Promise<void> {
  const profile = await database
    .collection<TenantBillingProfile>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        session,
        projection: {
          planKey: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new ProductImageProductNotFoundError();
  requireTenantWriteEntitlement(profile);
}

async function findMutableProduct(
  database: Db,
  context: TenantContext,
  productId: string,
  session?: ClientSession,
): Promise<ProductImageProductDocument> {
  const product = await database
    .collection<ProductImageProductDocument>("products")
    .findOne(
      {
        _id: productId,
        tenantId: context.tenantId,
        deletedAt: { $exists: false },
      },
      { session },
    );
  if (!product) throw new ProductImageProductNotFoundError();
  if (product.status === "archived")
    throw new ProductImageProductArchivedError();
  return product;
}

async function touchProduct(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  product: ProductImageProductDocument,
  now: Date,
): Promise<void> {
  const update = await database
    .collection<ProductImageProductDocument>("products")
    .updateOne(
      {
        _id: product._id,
        tenantId: context.tenantId,
        version: product.version,
        status: { $ne: "archived" },
        deletedAt: { $exists: false },
      },
      {
        $set: { updatedAt: now, updatedBy: context.userId },
        $inc: { version: 1 },
      },
      { session },
    );
  if (update.matchedCount !== 1) throw new ProductImageVersionConflictError();
}

async function appendAudit(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  input: {
    action: string;
    imageId: string;
    summary: string;
    changes: Record<string, unknown>;
    now: Date;
  },
): Promise<void> {
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: input.action,
      entityType: "product_image",
      entityId: input.imageId,
      requestId: context.requestId,
      summary: input.summary,
      changes: input.changes,
      createdAt: input.now,
    },
    { session },
  );
}

function activeImageFilter(context: TenantContext, productId: string) {
  return {
    tenantId: context.tenantId,
    productId,
    status: "active" as const,
  };
}

export class ProductImageService {
  async assertUploadAllowed(
    context: TenantContext,
    productId: string,
  ): Promise<void> {
    requirePermission(context.permissions, "product:update");
    const database = await getDatabase();
    await requireWriteAccess(database, context.tenantId);
    await findMutableProduct(database, context, productId);
    const count = await database
      .collection<ProductImageDocument>("productImages")
      .countDocuments(activeImageFilter(context, productId), {
        limit: MAX_PRODUCT_IMAGES + 1,
      });
    if (count >= MAX_PRODUCT_IMAGES) throw new ProductImageLimitError();
  }

  async attach(
    context: TenantContext,
    untrustedInput: AttachProductImageInput,
  ): Promise<{ imageVersion: number; productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = attachProductImageSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findMutableProduct(
          database,
          context,
          input.productId,
          session,
        );
        const images =
          database.collection<ProductImageDocument>("productImages");
        const [count, lastImage] = await Promise.all([
          images.countDocuments(activeImageFilter(context, input.productId), {
            session,
            limit: MAX_PRODUCT_IMAGES + 1,
          }),
          images.findOne(activeImageFilter(context, input.productId), {
            session,
            sort: { position: -1, _id: -1 },
            projection: { position: 1 },
          }),
        ]);
        if (count >= MAX_PRODUCT_IMAGES) throw new ProductImageLimitError();
        const now = new Date();
        const isPrimary = count === 0;
        const position = (lastImage?.position ?? -1) + 1;
        await images.insertOne(
          {
            _id: input.imageId,
            tenantId: context.tenantId,
            productId: input.productId,
            cloudinaryPublicId: input.upload.publicId,
            cloudinaryAssetId: input.upload.assetId,
            cloudinaryVersion: input.upload.version,
            secureUrl: input.upload.secureUrl,
            width: input.upload.width,
            height: input.upload.height,
            format: input.upload.format,
            bytes: input.upload.bytes,
            altText: input.altText,
            position,
            isPrimary,
            status: "active",
            cleanupStatus: "not_required",
            cleanupAttempts: 0,
            version: 1,
            createdAt: now,
            createdBy: context.userId,
            updatedAt: now,
            updatedBy: context.userId,
          },
          { session },
        );
        await touchProduct(database, session, context, product, now);
        await appendAudit(database, session, context, {
          action: "product.image.uploaded",
          imageId: input.imageId,
          summary: "Uploaded a product image.",
          changes: {
            after: {
              productId: input.productId,
              altText: input.altText,
              position,
              isPrimary,
              width: input.upload.width,
              height: input.upload.height,
              format: input.upload.format,
              bytes: input.upload.bytes,
            },
          },
          now,
        });
        return { imageVersion: 1, productVersion: product.version + 1 };
      }),
    );
    if (!result) throw new Error("Product image attachment did not complete.");
    return result;
  }

  async updateAltText(
    context: TenantContext,
    untrustedInput: UpdateProductImageAltInput,
  ): Promise<{ imageVersion: number; productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateProductImageAltSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findMutableProduct(
          database,
          context,
          input.productId,
          session,
        );
        const images =
          database.collection<ProductImageDocument>("productImages");
        const image = await images.findOne(
          {
            _id: input.imageId,
            ...activeImageFilter(context, input.productId),
          },
          { session },
        );
        if (!image) throw new ProductImageNotFoundError();
        if (image.version !== input.expectedVersion)
          throw new ProductImageVersionConflictError();
        if (image.altText === input.altText)
          return {
            imageVersion: image.version,
            productVersion: product.version,
          };
        const now = new Date();
        const update = await images.updateOne(
          {
            _id: input.imageId,
            ...activeImageFilter(context, input.productId),
            version: input.expectedVersion,
          },
          {
            $set: {
              altText: input.altText,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1)
          throw new ProductImageVersionConflictError();
        await touchProduct(database, session, context, product, now);
        await appendAudit(database, session, context, {
          action: "product.image.alt_text_updated",
          imageId: input.imageId,
          summary: "Updated product image alternative text.",
          changes: {
            before: { altText: image.altText },
            after: { altText: input.altText },
          },
          now,
        });
        return {
          imageVersion: input.expectedVersion + 1,
          productVersion: product.version + 1,
        };
      }),
    );
    if (!result) throw new Error("Product image update did not complete.");
    return result;
  }

  async setPrimary(
    context: TenantContext,
    untrustedInput: ProductImageMutationInput,
  ): Promise<{ imageVersion: number; productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = productImageMutationSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findMutableProduct(
          database,
          context,
          input.productId,
          session,
        );
        const images =
          database.collection<ProductImageDocument>("productImages");
        const image = await images.findOne(
          {
            _id: input.imageId,
            ...activeImageFilter(context, input.productId),
          },
          { session },
        );
        if (!image) throw new ProductImageNotFoundError();
        if (image.version !== input.expectedVersion)
          throw new ProductImageVersionConflictError();
        if (image.isPrimary)
          return {
            imageVersion: image.version,
            productVersion: product.version,
          };
        const now = new Date();
        await images.updateMany(
          {
            ...activeImageFilter(context, input.productId),
            _id: { $ne: input.imageId },
            isPrimary: true,
          },
          {
            $set: {
              isPrimary: false,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        const update = await images.updateOne(
          {
            _id: input.imageId,
            ...activeImageFilter(context, input.productId),
            version: input.expectedVersion,
          },
          {
            $set: {
              isPrimary: true,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1)
          throw new ProductImageVersionConflictError();
        await touchProduct(database, session, context, product, now);
        await appendAudit(database, session, context, {
          action: "product.image.primary_selected",
          imageId: input.imageId,
          summary: "Selected the primary product image.",
          changes: { after: { productId: input.productId, isPrimary: true } },
          now,
        });
        return {
          imageVersion: input.expectedVersion + 1,
          productVersion: product.version + 1,
        };
      }),
    );
    if (!result)
      throw new Error("Primary product image selection did not complete.");
    return result;
  }

  async move(
    context: TenantContext,
    untrustedInput: MoveProductImageInput,
  ): Promise<{ moved: boolean; productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = moveProductImageSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findMutableProduct(
          database,
          context,
          input.productId,
          session,
        );
        const images =
          database.collection<ProductImageDocument>("productImages");
        const ordered = await images
          .find(activeImageFilter(context, input.productId), { session })
          .sort({ position: 1, _id: 1 })
          .toArray();
        const index = ordered.findIndex((image) => image._id === input.imageId);
        const image = ordered[index];
        if (!image) throw new ProductImageNotFoundError();
        if (image.version !== input.expectedVersion)
          throw new ProductImageVersionConflictError();
        const neighborIndex =
          input.direction === "previous" ? index - 1 : index + 1;
        const neighbor = ordered[neighborIndex];
        if (!neighbor) return { moved: false, productVersion: product.version };
        const now = new Date();
        const first = await images.updateOne(
          {
            _id: image._id,
            ...activeImageFilter(context, input.productId),
            version: image.version,
          },
          {
            $set: {
              position: neighbor.position,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        const second = await images.updateOne(
          {
            _id: neighbor._id,
            ...activeImageFilter(context, input.productId),
            version: neighbor.version,
          },
          {
            $set: {
              position: image.position,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (first.matchedCount !== 1 || second.matchedCount !== 1)
          throw new ProductImageVersionConflictError();
        await touchProduct(database, session, context, product, now);
        await appendAudit(database, session, context, {
          action: "product.image.reordered",
          imageId: image._id,
          summary: "Changed product image order.",
          changes: {
            before: { position: image.position },
            after: { position: neighbor.position },
          },
          now,
        });
        return { moved: true, productVersion: product.version + 1 };
      }),
    );
    if (!result) throw new Error("Product image reorder did not complete.");
    return result;
  }

  async archive(
    context: TenantContext,
    untrustedInput: ProductImageMutationInput,
  ): Promise<{
    publicId: string;
    archivedImageVersion: number;
    productVersion: number;
  }> {
    requirePermission(context.permissions, "product:update");
    const input = productImageMutationSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findMutableProduct(
          database,
          context,
          input.productId,
          session,
        );
        const images =
          database.collection<ProductImageDocument>("productImages");
        const image = await images.findOne(
          {
            _id: input.imageId,
            ...activeImageFilter(context, input.productId),
          },
          { session },
        );
        if (!image) throw new ProductImageNotFoundError();
        if (image.version !== input.expectedVersion)
          throw new ProductImageVersionConflictError();
        const now = new Date();
        const archived = await images.updateOne(
          {
            _id: image._id,
            ...activeImageFilter(context, input.productId),
            version: input.expectedVersion,
          },
          {
            $set: {
              status: "archived",
              isPrimary: false,
              cleanupStatus: "pending",
              archivedAt: now,
              archivedBy: context.userId,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (archived.matchedCount !== 1)
          throw new ProductImageVersionConflictError();
        const remaining = await images
          .find(activeImageFilter(context, input.productId), { session })
          .sort({ position: 1, _id: 1 })
          .toArray();
        const retainedPrimary = remaining.find((candidate) =>
          Boolean(candidate.isPrimary),
        );
        const primaryId = (
          image.isPrimary ? remaining[0] : (retainedPrimary ?? remaining[0])
        )?._id;
        for (const [position, remainingImage] of remaining.entries()) {
          const shouldBePrimary = remainingImage._id === primaryId;
          if (
            remainingImage.position === position &&
            remainingImage.isPrimary === shouldBePrimary
          )
            continue;
          const reorder = await images.updateOne(
            {
              _id: remainingImage._id,
              ...activeImageFilter(context, input.productId),
              version: remainingImage.version,
            },
            {
              $set: {
                position,
                isPrimary: shouldBePrimary,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
          if (reorder.matchedCount !== 1)
            throw new ProductImageVersionConflictError();
        }
        await touchProduct(database, session, context, product, now);
        await appendAudit(database, session, context, {
          action: "product.image.removed",
          imageId: image._id,
          summary: "Removed a product image from the catalog.",
          changes: {
            before: {
              productId: input.productId,
              altText: image.altText,
              position: image.position,
              isPrimary: image.isPrimary,
            },
            after: { status: "archived", cleanupStatus: "pending" },
          },
          now,
        });
        return {
          publicId: image.cloudinaryPublicId,
          archivedImageVersion: input.expectedVersion + 1,
          productVersion: product.version + 1,
        };
      }),
    );
    if (!result) throw new Error("Product image removal did not complete.");
    return result;
  }

  async recordCleanupResult(
    context: TenantContext,
    input: {
      productId: string;
      imageId: string;
      archivedImageVersion: number;
      completed: boolean;
    },
  ): Promise<void> {
    requirePermission(context.permissions, "product:update");
    const parsed = productImageMutationSchema.parse({
      productId: input.productId,
      imageId: input.imageId,
      expectedVersion: input.archivedImageVersion,
    });
    const database = await getDatabase();
    const update = input.completed
      ? {
          $set: {
            cleanupStatus: "complete" as const,
            updatedAt: new Date(),
            updatedBy: context.userId,
          },
          $unset: { cleanupError: "" as const },
          $inc: { cleanupAttempts: 1, version: 1 },
        }
      : {
          $set: {
            cleanupStatus: "pending" as const,
            cleanupError: "Cloudinary deletion requires retry.",
            updatedAt: new Date(),
            updatedBy: context.userId,
          },
          $inc: { cleanupAttempts: 1, version: 1 },
        };
    await database.collection<ProductImageDocument>("productImages").updateOne(
      {
        _id: parsed.imageId,
        tenantId: context.tenantId,
        productId: parsed.productId,
        status: "archived",
        version: parsed.expectedVersion,
      },
      update,
    );
  }

  async recordOrphanCleanup(
    context: TenantContext,
    input: {
      productId: string;
      imageId: string;
      publicId: string;
    },
  ): Promise<void> {
    requirePermission(context.permissions, "product:update");
    const parsed = attachProductImageSchema
      .pick({ productId: true, imageId: true })
      .extend({ publicId: z.string().trim().min(1).max(500) })
      .parse(input);
    const now = new Date();
    const database = await getDatabase();
    await database.collection<StringIdDocument>("mediaCleanupTasks").updateOne(
      { provider: "cloudinary", publicId: parsed.publicId },
      {
        $setOnInsert: {
          _id: createOpaqueId("cln"),
          tenantId: context.tenantId,
          productId: parsed.productId,
          imageId: parsed.imageId,
          provider: "cloudinary",
          publicId: parsed.publicId,
          reason: "database_attach_failed",
          status: "pending",
          attempts: 1,
          createdAt: now,
          createdBy: context.userId,
        },
        $set: { updatedAt: now, updatedBy: context.userId },
      },
      { upsert: true },
    );
  }
}
