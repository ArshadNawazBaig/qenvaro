import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CustomerService } from "@/modules/customers/service";
import {
  InventoryNegativeStockError,
  InventoryVersionConflictError,
} from "@/modules/inventory/service";
import {
  PermissionError,
  resolvePermissions,
} from "@/modules/permissions/permissions";
import { ProductService } from "@/modules/products/service";
import { saleCatalogQuerySchema } from "@/modules/sales/schemas";
import {
  SaleIdempotencyConflictError,
  SaleProductUnavailableError,
  SaleService,
  SaleStoreUnavailableError,
  SaleVoidConflictError,
} from "@/modules/sales/service";
import { SaleRepository } from "@/server/repositories/sales";
import type { TenantContext } from "@/server/tenancy/context";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)("atomic point-of-sale lifecycle", () => {
  const suffix = crypto.randomUUID();
  const tenantId = `org_sale_${suffix}`;
  const otherTenantId = `org_sale_other_${suffix}`;
  const storeId = `store_sale_${suffix}`;
  const otherStoreId = `store_sale_other_${suffix}`;
  const barcode = `890${suffix.replaceAll("-", "").slice(0, 16)}`;
  const client = new MongoClient(process.env.MONGODB_URI!);
  let database: Db;
  let productId: string;
  let otherProductId: string;
  let customerId: string;
  let saleId: string;

  const ownerContext: TenantContext = {
    tenantId,
    tenantSlug: `sale-${suffix}`,
    userId: `usr_sale_${suffix}`,
    sessionId: `session_sale_${suffix}`,
    membershipId: `member_sale_${suffix}`,
    roles: ["OWNER"],
    permissions: resolvePermissions(["OWNER"]),
    allowedStoreIds: new Set([storeId]),
    activeStoreId: storeId,
    requestId: `request_sale_${suffix}`,
  };
  const otherContext: TenantContext = {
    ...ownerContext,
    tenantId: otherTenantId,
    tenantSlug: `sale-other-${suffix}`,
    allowedStoreIds: new Set([otherStoreId]),
    activeStoreId: otherStoreId,
  };

  const customerFields = {
    name: "Sale Customer",
    company: "Private Customer Company",
    email: "sale-customer@example.test",
    phone: "+92 300 555 0123",
    address: {
      line1: "Private Sale Address",
      line2: "",
      city: "Karachi",
      region: "Sindh",
      postalCode: "",
      countryCode: "PK",
    },
    notes: "Private sale customer note",
  };

  beforeAll(async () => {
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    const now = new Date();
    await database.collection<StringIdDocument>("tenantProfiles").insertMany([
      {
        _id: `profile_sale_${suffix}`,
        tenantId,
        slug: ownerContext.tenantSlug,
        businessName: "Sale Integration",
        phone: "+92 21 555 0100",
        address: "100 Commerce Road, Karachi",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "growth",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        inventorySettings: { allowNegativeStock: false },
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: `profile_sale_other_${suffix}`,
        tenantId: otherTenantId,
        slug: otherContext.tenantSlug,
        businessName: "Other Sale Integration",
        currency: "PKR",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        planKey: "starter",
        billingStatus: "trialing",
        trialEndsAt: new Date(now.getTime() + 86_400_000),
        inventorySettings: { allowNegativeStock: false },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringIdDocument>("stores").insertMany([
      {
        _id: storeId,
        tenantId,
        code: "MAIN",
        name: "Main Store",
        address: "12 Market Street, Karachi",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: otherStoreId,
        tenantId: otherTenantId,
        code: "MAIN",
        name: "Other Main Store",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    productId = (
      await new ProductService().createSimple(ownerContext, {
        name: "Sale Counter Kit",
        sku: `SALE-${suffix.slice(0, 8)}`,
        barcode,
        category: "Hardware",
        priceMinor: 1_000,
        openingStock: 10,
      })
    ).id;
    otherProductId = (
      await new ProductService().createSimple(otherContext, {
        name: "Other Counter Kit",
        sku: `OTHER-${suffix.slice(0, 8)}`,
        barcode,
        category: "Hardware",
        priceMinor: 1_000,
        openingStock: 5,
      })
    ).id;
    await database
      .collection<StringIdDocument>("products")
      .updateOne(
        { _id: productId, tenantId },
        { $set: { costMinor: 400, taxRateBps: 1_000 } },
      );
    customerId = (
      await new CustomerService().create(ownerContext, customerFields)
    ).id;
  });

  afterAll(async () => {
    for (const collection of [
      "auditLogs",
      "categories",
      "customers",
      "inventoryLevels",
      "inventoryMovements",
      "productVariants",
      "products",
      "receipts",
      "salePayments",
      "sales",
      "sequenceCounters",
      "stores",
      "tenantProfiles",
      "units",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: [tenantId, otherTenantId] },
      });
    await client.close();
  });

  const saleInput = () => ({
    storeId,
    customerId,
    lines: [
      {
        variantId: `${productId}_default`,
        quantity: 2,
        discountBps: 1_000,
        expectedLevelVersion: 1,
      },
    ],
    payments: [{ method: "cash" as const, tenderedMinor: 2_500 }],
    note: "Private checkout note",
    idempotencyKey: `sale:${suffix}`,
  });

  it("projects a scoped, bounded active-store checkout workspace", async () => {
    const repository = new SaleRepository();
    const workspace = await repository.workspace(
      ownerContext,
      saleCatalogQuerySchema.parse({ q: "SALE-", pageSize: 6 }),
    );
    expect(workspace.store).toMatchObject({ id: storeId, code: "MAIN" });
    expect(workspace.catalog.total).toBe(1);
    expect(workspace.catalog.items[0]).toMatchObject({
      productId,
      variantId: `${productId}_default`,
      priceMinor: 1_000,
      taxRateBps: 1_000,
      quantity: 10,
      levelVersion: 1,
    });
    expect(workspace.customers).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: customerId })]),
    );
  });

  it("resolves barcode and SKU scans only inside the active tenant store", async () => {
    const repository = new SaleRepository();
    const [byBarcode, bySku, otherTenantMatch] = await Promise.all([
      repository.scan(ownerContext, barcode),
      repository.scan(ownerContext, `sale-${suffix.slice(0, 8)}`),
      repository.scan(otherContext, barcode),
    ]);
    expect(byBarcode).toMatchObject({
      productId,
      variantId: `${productId}_default`,
      quantity: 10,
      levelVersion: 1,
    });
    expect(bySku?.variantId).toBe(`${productId}_default`);
    expect(otherTenantMatch?.productId).toBe(otherProductId);
    await expect(
      repository.scan(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        barcode,
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      repository.scan({ ...ownerContext, activeStoreId: null }, barcode),
    ).resolves.toBeNull();
    await expect(
      repository.scan(ownerContext, "missing-code"),
    ).resolves.toBeNull();
  });

  it("atomically completes payment, receipt, snapshots, and inventory", async () => {
    const result = await new SaleService().complete(ownerContext, saleInput());
    saleId = result.id;
    expect(result).toMatchObject({
      receiptNumber: "MAIN-000001",
      idempotent: false,
    });
    const [sale, payment, receipt, level, movement, product, counter, audit] =
      await Promise.all([
        database.collection<StringIdDocument>("sales").findOne({
          _id: saleId,
          tenantId,
        }),
        database.collection<StringIdDocument>("salePayments").findOne({
          tenantId,
          saleId,
        }),
        database.collection<StringIdDocument>("receipts").findOne({
          tenantId,
          saleId,
        }),
        database.collection<StringIdDocument>("inventoryLevels").findOne({
          tenantId,
          storeId,
          variantId: `${productId}_default`,
        }),
        database.collection<StringIdDocument>("inventoryMovements").findOne({
          tenantId,
          sourceType: "sale",
          sourceId: saleId,
        }),
        database.collection<StringIdDocument>("products").findOne({
          tenantId,
          _id: productId,
        }),
        database.collection<StringIdDocument>("sequenceCounters").findOne({
          tenantId,
          storeId,
          sequenceType: "receipt",
        }),
        database.collection<StringIdDocument>("auditLogs").findOne({
          tenantId,
          entityId: saleId,
          action: "sale.completed",
        }),
      ]);
    expect(sale).toMatchObject({
      receiptNumber: "MAIN-000001",
      status: "completed",
      subtotalMinor: 2_000,
      discountMinor: 200,
      taxMinor: 180,
      netTotalMinor: 1_800,
      totalMinor: 1_980,
      grossProfitMinor: 1_000,
      tenderedMinor: 2_500,
      changeMinor: 520,
      customer: { id: customerId, code: expect.stringMatching(/^C-/) },
      lines: [
        expect.objectContaining({
          productId,
          variantId: `${productId}_default`,
          productName: "Sale Counter Kit",
          sku: `SALE-${suffix.slice(0, 8)}`,
          unitPriceMinor: 1_000,
          unitCostMinor: 400,
          quantity: 2,
          lineTotalMinor: 1_980,
        }),
      ],
    });
    expect(payment).toMatchObject({
      method: "cash",
      tenderedMinor: 2_500,
      appliedMinor: 1_980,
      provider: "manual",
      status: "recorded",
    });
    expect(receipt).toMatchObject({
      receiptNumber: "MAIN-000001",
      status: "issued",
    });
    expect(level).toMatchObject({ quantity: 8, version: 2 });
    expect(movement).toMatchObject({
      type: "sale",
      quantityDelta: -2,
      resultingQuantity: 8,
    });
    expect(product).toMatchObject({ stock: 8, revenueMinor: 1_800 });
    expect(counter).toMatchObject({ value: 1 });
    expect(audit).toMatchObject({
      changes: {
        after: {
          receiptNumber: "MAIN-000001",
          lineCount: 1,
          unitCount: 2,
          status: "completed",
        },
      },
    });
    const auditText = JSON.stringify(audit);
    for (const privateValue of [
      customerFields.name,
      customerFields.company,
      customerFields.email,
      customerFields.phone,
      customerFields.address.line1,
      customerFields.notes,
      "Private checkout note",
      "cash",
      "2500",
    ])
      expect(auditText).not.toContain(privateValue);
  });

  it("returns the same completion for an identical retry only", async () => {
    await expect(
      new SaleService().complete(ownerContext, saleInput()),
    ).resolves.toEqual({
      id: saleId,
      receiptNumber: "MAIN-000001",
      idempotent: true,
    });
    const counts = await Promise.all([
      database.collection("sales").countDocuments({ tenantId }),
      database.collection("salePayments").countDocuments({ tenantId }),
      database.collection("receipts").countDocuments({ tenantId }),
      database.collection("inventoryMovements").countDocuments({
        tenantId,
        sourceType: "sale",
      }),
    ]);
    expect(counts).toEqual([1, 1, 1, 1]);
    await expect(
      new SaleService().complete(ownerContext, {
        ...saleInput(),
        note: "A different request using the same key",
      }),
    ).rejects.toBeInstanceOf(SaleIdempotencyConflictError);
  });

  it("rejects permission, active-store, cross-tenant, stale, and negative stock", async () => {
    const service = new SaleService();
    await expect(
      service.complete(
        {
          ...ownerContext,
          roles: ["VIEWER"],
          permissions: resolvePermissions(["VIEWER"]),
        },
        { ...saleInput(), idempotencyKey: `sale:denied:${suffix}` },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      service.complete(
        { ...ownerContext, activeStoreId: null },
        { ...saleInput(), idempotencyKey: `sale:store:${suffix}` },
      ),
    ).rejects.toBeInstanceOf(SaleStoreUnavailableError);
    await expect(
      service.complete(ownerContext, {
        ...saleInput(),
        lines: [
          {
            variantId: `${otherProductId}_default`,
            quantity: 1,
            discountBps: 0,
            expectedLevelVersion: 1,
          },
        ],
        idempotencyKey: `sale:tenant:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(SaleProductUnavailableError);
    await expect(
      service.complete(ownerContext, {
        ...saleInput(),
        customerId: "",
        lines: [{ ...saleInput().lines[0]!, quantity: 1 }],
        payments: [{ method: "cash", tenderedMinor: 2_000 }],
        idempotencyKey: `sale:stale:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(InventoryVersionConflictError);
    await expect(
      service.complete(ownerContext, {
        ...saleInput(),
        customerId: "",
        lines: [
          {
            ...saleInput().lines[0]!,
            quantity: 100,
            expectedLevelVersion: 2,
          },
        ],
        payments: [{ method: "cash", tenderedMinor: 100_000 }],
        idempotencyKey: `sale:negative:${suffix}`,
      }),
    ).rejects.toBeInstanceOf(InventoryNegativeStockError);
    expect(
      await database.collection("sales").countDocuments({ tenantId }),
    ).toBe(1);
    expect(
      await database.collection("sequenceCounters").findOne({
        tenantId,
        storeId,
        sequenceType: "receipt",
      }),
    ).toMatchObject({ value: 1 });
  });

  it("reads only authorized tenant/store receipts and exposes migration indexes", async () => {
    const repository = new SaleRepository();
    const receipt = await repository.receipt(ownerContext, saleId);
    expect(receipt).toMatchObject({
      id: saleId,
      receiptNumber: "MAIN-000001",
      businessName: "Sale Integration",
      businessPhone: "+92 21 555 0100",
      businessAddress: "100 Commerce Road, Karachi",
      store: expect.objectContaining({
        address: "12 Market Street, Karachi",
      }),
      totalMinor: 1_980,
      timezone: "Asia/Karachi",
    });
    await expect(repository.receipt(otherContext, saleId)).resolves.toBeNull();
    const [saleIndexes, paymentIndexes, receiptIndexes] = await Promise.all([
      database.collection("sales").indexes(),
      database.collection("salePayments").indexes(),
      database.collection("receipts").indexes(),
    ]);
    expect(saleIndexes.map((index) => index.name)).toContain(
      "tenant_store_receipt_unique",
    );
    expect(paymentIndexes.map((index) => index.name)).toContain(
      "tenant_sale_payments",
    );
    expect(receiptIndexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "tenant_sale_receipt_unique",
        "tenant_receipt_number_unique",
      ]),
    );
  });

  it("voids a sale idempotently, restores stock, reverses revenue, and preserves evidence", async () => {
    const service = new SaleService();
    await expect(
      service.void(
        {
          ...ownerContext,
          roles: ["MANAGER"],
          permissions: resolvePermissions(["MANAGER"]),
        },
        {
          saleId,
          confirmationReceiptNumber: "MAIN-000001",
          reason: "Entered in error",
        },
      ),
    ).rejects.toBeInstanceOf(PermissionError);
    await expect(
      service.void(ownerContext, {
        saleId,
        confirmationReceiptNumber: "WRONG",
        reason: "Entered in error",
      }),
    ).rejects.toThrow("exact receipt number");
    await database.collection<StringIdDocument>("sales").insertOne({
      _id: `sale_returned_${suffix}`,
      tenantId,
      storeId,
      receiptNumber: "MAIN-RETURNED",
      status: "completed",
      lines: [],
      returnedTotalMinor: 1,
      version: 1,
    });
    await expect(
      service.void(ownerContext, {
        saleId: `sale_returned_${suffix}`,
        confirmationReceiptNumber: "MAIN-RETURNED",
        reason: "Should use returns",
      }),
    ).rejects.toBeInstanceOf(SaleVoidConflictError);

    await expect(
      service.void(ownerContext, {
        saleId,
        confirmationReceiptNumber: "MAIN-000001",
        reason: "Entered in error",
      }),
    ).resolves.toEqual({
      alreadyVoided: false,
      receiptNumber: "MAIN-000001",
    });
    await expect(
      service.void(ownerContext, {
        saleId,
        confirmationReceiptNumber: "MAIN-000001",
        reason: "Entered in error",
      }),
    ).resolves.toEqual({
      alreadyVoided: true,
      receiptNumber: "MAIN-000001",
    });

    const [sale, payment, receipt, level, movement, product, audit, view] =
      await Promise.all([
        database.collection<StringIdDocument>("sales").findOne({
          _id: saleId,
          tenantId,
        }),
        database.collection<StringIdDocument>("salePayments").findOne({
          tenantId,
          saleId,
        }),
        database.collection<StringIdDocument>("receipts").findOne({
          tenantId,
          saleId,
        }),
        database.collection<StringIdDocument>("inventoryLevels").findOne({
          tenantId,
          storeId,
          variantId: `${productId}_default`,
        }),
        database.collection<StringIdDocument>("inventoryMovements").findOne({
          tenantId,
          sourceType: "sale_void",
          sourceId: saleId,
        }),
        database.collection<StringIdDocument>("products").findOne({
          tenantId,
          _id: productId,
        }),
        database.collection<StringIdDocument>("auditLogs").findOne({
          tenantId,
          entityId: saleId,
          action: "sale.voided",
        }),
        new SaleRepository().receipt(ownerContext, saleId),
      ]);
    expect(sale).toMatchObject({
      status: "voided",
      voidReason: "Entered in error",
      version: 2,
    });
    expect(payment).toMatchObject({ status: "voided" });
    expect(receipt).toMatchObject({ status: "voided" });
    expect(level).toMatchObject({ quantity: 10, version: 3 });
    expect(movement).toMatchObject({
      type: "sale_void",
      quantityDelta: 2,
      resultingQuantity: 10,
    });
    expect(product).toMatchObject({ stock: 10, revenueMinor: 0 });
    expect(audit).toMatchObject({ actorId: ownerContext.userId });
    expect(view).toMatchObject({
      status: "voided",
      voidReason: "Entered in error",
    });
  });
});
