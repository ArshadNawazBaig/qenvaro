import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import {
  ProductImageLimitError,
  ProductImageProductNotFoundError,
  ProductImageService,
  ProductImageVersionConflictError,
} from "@/modules/product-images/service";
import { ProductService } from "@/modules/products/service";
import { ProductRepository } from "@/server/repositories/products";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("product image lifecycle transaction", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_image_${suffix}`;
  const otherTenantId = `org_image_other_${suffix}`;
  const storeId = `store_image_${suffix}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let firstImageId: string;
  let secondImageId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `image-${suffix}`,
    userId: `usr_image_${suffix}`,
    sessionId: `session_image_${suffix}`,
    membershipId: `member_image_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_image_${suffix}`,
  };

  function upload(index: number) {
    return {
      publicId: `qenvaro/products/${tenantId}/${productId}/img_${index}_${suffix}`,
      assetId: `asset_${index}_${suffix}`,
      version: index + 1,
      secureUrl: `https://res.cloudinary.com/test/image/upload/v${index + 1}/img_${index}_${suffix}.webp`,
      width: 1200,
      height: 900,
      format: "webp",
      bytes: 200_000 + index,
    };
  }

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_image_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Image Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_image_other_${suffix}`,
        tenantId: otherTenantId,
        slug: `image-other-${suffix}`,
        businessName: "Other Image Integration",
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringIdDocument>("stores").insertOne({
      _id: storeId,
      tenantId,
      code: "MAIN",
      name: "Main Store",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Image-ready Oxford",
        sku: `IMG-${suffix.slice(0, 8)}`,
        category: "Apparel",
        priceMinor: 7_900,
        openingStock: 3,
      })
    ).id;
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "inventoryLevels",
      "inventoryMovements",
      "mediaCleanupTasks",
      "productImages",
      "productVariants",
      "products",
      "stores",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  it("attaches ordered images and promotes the first image", async () => {
    const service = new ProductImageService();
    firstImageId = `img_first_${suffix}`;
    secondImageId = `img_second_${suffix}`;
    const first = await service.attach(ownerContext, {
      productId,
      imageId: firstImageId,
      altText: "Front view of the Oxford shirt",
      upload: upload(1),
    });
    const second = await service.attach(ownerContext, {
      productId,
      imageId: secondImageId,
      altText: "Back view of the Oxford shirt",
      upload: upload(2),
    });
    const detail = await new ProductRepository().detail(
      ownerContext,
      productId,
    );

    expect(first).toEqual({ imageVersion: 1, productVersion: 2 });
    expect(second).toEqual({ imageVersion: 1, productVersion: 3 });
    expect(detail?.images).toMatchObject([
      { id: firstImageId, position: 0, isPrimary: true },
      { id: secondImageId, position: 1, isPrimary: false },
    ]);
    expect(detail?.primaryImage?.altText).toBe(
      "Front view of the Oxford shirt",
    );
  });

  it("selects, reorders, and edits images with optimistic concurrency", async () => {
    const service = new ProductImageService();
    expect(
      await service.setPrimary(ownerContext, {
        productId,
        imageId: secondImageId,
        expectedVersion: 1,
      }),
    ).toEqual({ imageVersion: 2, productVersion: 4 });
    expect(
      await service.move(ownerContext, {
        productId,
        imageId: secondImageId,
        expectedVersion: 2,
        direction: "previous",
      }),
    ).toEqual({ moved: true, productVersion: 5 });
    expect(
      await service.updateAltText(ownerContext, {
        productId,
        imageId: secondImageId,
        expectedVersion: 3,
        altText: "Detail of the Oxford shirt back panel",
      }),
    ).toEqual({ imageVersion: 4, productVersion: 6 });
    await expect(
      service.updateAltText(ownerContext, {
        productId,
        imageId: secondImageId,
        expectedVersion: 3,
        altText: "Stale change",
      }),
    ).rejects.toBeInstanceOf(ProductImageVersionConflictError);

    const detail = await new ProductRepository().detail(
      ownerContext,
      productId,
    );
    expect(detail?.images[0]).toMatchObject({
      id: secondImageId,
      isPrimary: true,
      altText: "Detail of the Oxford shirt back panel",
    });
  });

  it("enforces permission and tenant ownership", async () => {
    const service = new ProductImageService();
    await expect(
      service.assertUploadAllowed(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        productId,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      service.assertUploadAllowed(
        {
          ...ownerContext,
          tenantId: otherTenantId,
          tenantSlug: `image-other-${suffix}`,
        },
        productId,
      ),
    ).rejects.toBeInstanceOf(ProductImageProductNotFoundError);
  });

  it("archives metadata, promotes the next image, and tracks cleanup", async () => {
    const service = new ProductImageService();
    const archived = await service.archive(ownerContext, {
      productId,
      imageId: secondImageId,
      expectedVersion: 4,
    });
    await service.recordCleanupResult(ownerContext, {
      productId,
      imageId: secondImageId,
      archivedImageVersion: archived.archivedImageVersion,
      completed: true,
    });
    const [detail, removed, audit] = await Promise.all([
      new ProductRepository().detail(ownerContext, productId),
      database.collection<StringIdDocument>("productImages").findOne({
        _id: secondImageId,
        tenantId,
      }),
      database.collection<StringIdDocument>("auditLogs").findOne({
        tenantId,
        entityId: secondImageId,
        action: "product.image.removed",
      }),
    ]);

    expect(detail?.images).toMatchObject([
      { id: firstImageId, position: 0, isPrimary: true },
    ]);
    expect(removed).toMatchObject({
      status: "archived",
      cleanupStatus: "complete",
      cleanupAttempts: 1,
    });
    expect(audit).toMatchObject({
      actorId: ownerContext.userId,
      requestId: ownerContext.requestId,
    });
  });

  it("enforces the eight-image product limit", async () => {
    const service = new ProductImageService();
    for (let index = 2; index <= 8; index += 1) {
      await service.attach(ownerContext, {
        productId,
        imageId: `img_limit_${index}_${suffix}`,
        altText: `Oxford shirt gallery view ${index}`,
        upload: upload(index + 10),
      });
    }
    await expect(
      service.assertUploadAllowed(ownerContext, productId),
    ).rejects.toBeInstanceOf(ProductImageLimitError);
    await expect(
      service.attach(ownerContext, {
        productId,
        imageId: `img_limit_9_${suffix}`,
        altText: "Ninth Oxford shirt view",
        upload: upload(19),
      }),
    ).rejects.toBeInstanceOf(ProductImageLimitError);
  });
});
