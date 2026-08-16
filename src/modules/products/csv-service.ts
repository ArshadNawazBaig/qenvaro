import "server-only";
import type { ClientSession, Db } from "mongodb";
import { z } from "zod";
import {
  assertUsageAvailable,
  hasPlanFeature,
  planKeySchema,
  type PlanKey,
} from "@/config/plans";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { parseDecimalToMinor } from "@/lib/money";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { InventoryService } from "@/modules/inventory/service";
import {
  createCategorySlug,
  normalizeCategoryName,
} from "@/modules/categories/schemas";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  mappedCsvCell,
  parseCsv,
  productCsvCommitSchema,
  productCsvPreviewMutationSchema,
  rowsToCsv,
  suggestProductCsvMapping,
  type ParsedCsv,
  type ProductCsvDuplicateBehavior,
  type ProductCsvField,
  type ProductCsvImportResult,
  type ProductCsvMapping,
  type ProductCsvPreviewResult,
  type ProductCsvRowIssue,
  type ProductCsvRowWarning,
  type ProductCsvValidationResult,
} from "@/modules/products/csv";
import type { ProductListQuery } from "@/modules/products/schemas";
import { normalizeTagName } from "@/modules/tags/schemas";
import { getDatabase, getMongoClient } from "@/server/db/client";
import { ProductRepository } from "@/server/repositories/products";
import type { TenantContext } from "@/server/tenancy/context";

const PREVIEW_TTL_MILLISECONDS = 30 * 60 * 1000;
const MAX_EXPORT_ROWS = 10_000;
const CSV_RATE_LIMIT_WINDOW_MILLISECONDS = 10 * 60 * 1000;
type StringIdDocument = { _id: string } & Record<string, unknown>;

type ProductCsvOperation = "preview" | "validate" | "import" | "export";

interface ProductCsvRateLimitDocument {
  _id: string;
  tenantId: string;
  userId: string;
  operation: ProductCsvOperation;
  count: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface TenantBillingProfile {
  planKey: string;
  currency: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

interface ProductImportDocument {
  _id: string;
  tenantId: string;
  userId: string;
  status: "uploaded" | "invalid" | "validated" | "imported";
  headers: string[];
  rows: string[][];
  rowCount: number;
  mapping?: ProductCsvMapping;
  duplicateSkuBehavior?: ProductCsvDuplicateBehavior;
  validatedRows?: ValidatedProductImportRow[];
  validation?: {
    totalRows: number;
    validRows: number;
    createCount: number;
    updateCount: number;
    skipCount: number;
    issues: ProductCsvRowIssue[];
    warnings: ProductCsvRowWarning[];
  };
  result?: {
    createdCount: number;
    updatedCount: number;
    skippedCount: number;
  };
  version: number;
  expiresAt: Date;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  importedAt?: Date;
}

interface MutableProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  subtitle: string;
  sku: string;
  normalizedSku: string;
  category: string;
  tagIds?: string[];
  priceMinor: number;
  currency: string;
  reorderLevel: number;
  status: "draft" | "active" | "archived";
  version: number;
  deletedAt?: Date;
}

interface MutableVariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  normalizedSku: string;
  isDefault?: boolean;
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
  deletedAt?: Date;
}

interface ProductTagDocument {
  _id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  status: "active" | "archived";
  deletedAt?: Date;
}

interface ValidatedProductImportRow {
  rowNumber: number;
  action: "create" | "update";
  productId?: string;
  expectedProductVersion?: number;
  name: string;
  sku: string;
  normalizedSku: string;
  subtitle: string;
  category: string;
  normalizedCategory: string;
  priceMinor: number;
  openingStock: number;
  reorderLevel: number;
  status: "draft" | "active";
  tagIds: string[];
}

interface PreliminaryRow extends Omit<
  ValidatedProductImportRow,
  "action" | "productId" | "expectedProductVersion" | "tagIds"
> {
  tagNames: string[];
}

const baseImportRowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/),
  subtitle: z.string().trim().max(160),
  category: z.string().trim().min(2).max(80),
  price: z.string().trim().min(1).max(32),
  openingStock: z.string().trim().max(32),
  reorderLevel: z.string().trim().max(32),
  status: z.string().trim().toLowerCase().max(20),
  tags: z.string().trim().max(1_000),
});

export class ProductCsvFeatureUnavailableError extends Error {
  constructor() {
    super("CSV import and export are not included in this plan.");
    this.name = "ProductCsvFeatureUnavailableError";
  }
}

export class ProductCsvPreviewNotFoundError extends Error {
  constructor() {
    super("The CSV preview expired or was not found.");
    this.name = "ProductCsvPreviewNotFoundError";
  }
}

export class ProductCsvPreviewConflictError extends Error {
  constructor() {
    super("This CSV preview changed or has already been used.");
    this.name = "ProductCsvPreviewConflictError";
  }
}

export class ProductCsvMappingError extends Error {
  constructor(
    message = "Choose valid, unique CSV columns for every required field.",
  ) {
    super(message);
    this.name = "ProductCsvMappingError";
  }
}

export class ProductCsvValidationError extends Error {
  constructor() {
    super("Resolve every row error before importing products.");
    this.name = "ProductCsvValidationError";
  }
}

export class ProductCsvImportConflictError extends Error {
  constructor() {
    super("The catalog changed after CSV validation. Validate the file again.");
    this.name = "ProductCsvImportConflictError";
  }
}

export class ProductCsvStoreRequiredError extends Error {
  constructor() {
    super("An authorized active store is required to import new products.");
    this.name = "ProductCsvStoreRequiredError";
  }
}

export class ProductCsvExportLimitError extends Error {
  constructor() {
    super(
      `Exports are limited to ${MAX_EXPORT_ROWS.toLocaleString()} products. Narrow the catalog filters and try again.`,
    );
    this.name = "ProductCsvExportLimitError";
  }
}

export class ProductCsvRateLimitError extends Error {
  constructor() {
    super("Too many CSV requests. Wait a few minutes and try again.");
    this.name = "ProductCsvRateLimitError";
  }
}

async function enforceCsvRateLimit(
  database: Db,
  context: TenantContext,
  operation: ProductCsvOperation,
) {
  const limits: Record<ProductCsvOperation, number> = {
    preview: 10,
    validate: 30,
    import: 10,
    export: 30,
  };
  const now = new Date();
  const bucket = Math.floor(now.getTime() / CSV_RATE_LIMIT_WINDOW_MILLISECONDS);
  const expiresAt = new Date((bucket + 2) * CSV_RATE_LIMIT_WINDOW_MILLISECONDS);
  const key = `product-csv:${context.tenantId}:${context.userId}:${operation}:${bucket}`;
  const record = await database
    .collection<ProductCsvRateLimitDocument>("applicationRateLimits")
    .findOneAndUpdate(
      { _id: key },
      {
        $inc: { count: 1 },
        $set: { updatedAt: now },
        $setOnInsert: {
          tenantId: context.tenantId,
          userId: context.userId,
          operation,
          expiresAt,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  if (!record || record.count > limits[operation])
    throw new ProductCsvRateLimitError();
}

async function loadProfile(
  database: Db,
  tenantId: string,
  session?: ClientSession,
): Promise<{ profile: TenantBillingProfile; planKey: PlanKey }> {
  const profile = await database
    .collection<TenantBillingProfile>("tenantProfiles")
    .findOne(
      { tenantId },
      {
        session,
        projection: {
          planKey: 1,
          currency: 1,
          billingStatus: 1,
          trialEndsAt: 1,
          graceEndsAt: 1,
          currentPeriodEndsAt: 1,
        },
      },
    );
  if (!profile) throw new ProductCsvPreviewNotFoundError();
  const planKey = planKeySchema.parse(profile.planKey);
  if (!hasPlanFeature(planKey, "csvImportExport"))
    throw new ProductCsvFeatureUnavailableError();
  return { profile, planKey };
}

function assertCurrentPreview(preview: ProductImportDocument | null) {
  if (!preview || preview.expiresAt <= new Date())
    throw new ProductCsvPreviewNotFoundError();
}

function parseInteger(
  value: string,
  field: "openingStock" | "reorderLevel",
  rowNumber: number,
  issues: ProductCsvRowIssue[],
): number {
  if (!value) return 0;
  if (!/^\d{1,7}$/.test(value)) {
    issues.push({
      rowNumber,
      field,
      message: "Enter a whole number from 0 to 1,000,000.",
    });
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed > 1_000_000) {
    issues.push({
      rowNumber,
      field,
      message: "Enter a whole number from 0 to 1,000,000.",
    });
    return 0;
  }
  return parsed;
}

function parseStatus(
  value: string,
  rowNumber: number,
  issues: ProductCsvRowIssue[],
): "draft" | "active" {
  if (!value || value === "active") return "active";
  if (value === "draft") return "draft";
  issues.push({
    rowNumber,
    field: "status",
    message: "Status must be active or draft.",
  });
  return "active";
}

function mappedRow(
  parsed: ParsedCsv,
  row: readonly string[],
  mapping: ProductCsvMapping,
) {
  return {
    name: mappedCsvCell(parsed, row, mapping.name),
    sku: mappedCsvCell(parsed, row, mapping.sku),
    subtitle: mappedCsvCell(parsed, row, mapping.subtitle),
    category: mappedCsvCell(parsed, row, mapping.category),
    price: mappedCsvCell(parsed, row, mapping.price),
    openingStock: mappedCsvCell(parsed, row, mapping.openingStock),
    reorderLevel: mappedCsvCell(parsed, row, mapping.reorderLevel),
    status: mappedCsvCell(parsed, row, mapping.status),
    tags: mappedCsvCell(parsed, row, mapping.tags),
  };
}

function zodField(path: PropertyKey | undefined): ProductCsvField | "row" {
  return typeof path === "string" &&
    [
      "name",
      "sku",
      "subtitle",
      "category",
      "price",
      "openingStock",
      "reorderLevel",
      "status",
      "tags",
    ].includes(path)
    ? (path as ProductCsvField)
    : "row";
}

async function appendAudit(
  database: Db,
  context: TenantContext,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    summary: string;
    changes: Record<string, unknown>;
    now: Date;
    session?: ClientSession;
  },
) {
  await database.collection<StringIdDocument>("auditLogs").insertOne(
    {
      _id: createOpaqueId("aud"),
      tenantId: context.tenantId,
      actorId: context.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      requestId: context.requestId,
      summary: input.summary,
      changes: input.changes,
      createdAt: input.now,
    },
    { session: input.session },
  );
}

export class ProductCsvService {
  async availability(context: TenantContext): Promise<{
    featureEnabled: boolean;
    writeEnabled: boolean;
  }> {
    requirePermission(context.permissions, "product:read");
    const database = await getDatabase();
    const profile = await database
      .collection<TenantBillingProfile>("tenantProfiles")
      .findOne(
        { tenantId: context.tenantId },
        {
          projection: {
            planKey: 1,
            billingStatus: 1,
            trialEndsAt: 1,
            graceEndsAt: 1,
            currentPeriodEndsAt: 1,
          },
        },
      );
    if (!profile) return { featureEnabled: false, writeEnabled: false };
    const parsedPlan = planKeySchema.safeParse(profile.planKey);
    const featureEnabled =
      parsedPlan.success && hasPlanFeature(parsedPlan.data, "csvImportExport");
    let writeEnabled = false;
    if (featureEnabled) {
      try {
        requireTenantWriteEntitlement(profile);
        writeEnabled = true;
      } catch {
        writeEnabled = false;
      }
    }
    return { featureEnabled, writeEnabled };
  }

  async createPreview(
    context: TenantContext,
    csvText: string,
  ): Promise<ProductCsvPreviewResult> {
    requirePermission(context.permissions, "product:import");
    const database = await getDatabase();
    await enforceCsvRateLimit(database, context, "preview");
    const parsed = parseCsv(csvText);
    const { profile } = await loadProfile(database, context.tenantId);
    requireTenantWriteEntitlement(profile);
    const previewId = createOpaqueId("imp");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PREVIEW_TTL_MILLISECONDS);
    await database
      .collection<ProductImportDocument>("productImportPreviews")
      .insertOne({
        _id: previewId,
        tenantId: context.tenantId,
        userId: context.userId,
        status: "uploaded",
        headers: parsed.headers,
        rows: parsed.rows,
        rowCount: parsed.rows.length,
        version: 1,
        expiresAt,
        createdAt: now,
        createdBy: context.userId,
        updatedAt: now,
        updatedBy: context.userId,
      });
    return {
      previewId,
      version: 1,
      headers: parsed.headers,
      sampleRows: parsed.rows.slice(0, 8),
      rowCount: parsed.rows.length,
      suggestedMapping: suggestProductCsvMapping(parsed.headers),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async validatePreview(
    context: TenantContext,
    untrustedInput: unknown,
  ): Promise<ProductCsvValidationResult> {
    requirePermission(context.permissions, "product:import");
    const input = productCsvPreviewMutationSchema.parse(untrustedInput);
    const database = await getDatabase();
    await enforceCsvRateLimit(database, context, "validate");
    const { profile } = await loadProfile(database, context.tenantId);
    requireTenantWriteEntitlement(profile);
    const preview = await database
      .collection<ProductImportDocument>("productImportPreviews")
      .findOne({
        _id: input.previewId,
        tenantId: context.tenantId,
        userId: context.userId,
      });
    assertCurrentPreview(preview);
    if (!preview) throw new ProductCsvPreviewNotFoundError();
    if (
      preview.status === "imported" ||
      preview.version !== input.expectedVersion
    )
      throw new ProductCsvPreviewConflictError();
    for (const column of Object.values(input.mapping).filter(Boolean))
      if (!preview.headers.includes(column)) throw new ProductCsvMappingError();

    const parsed: ParsedCsv = { headers: preview.headers, rows: preview.rows };
    const issues: ProductCsvRowIssue[] = [];
    const warnings: ProductCsvRowWarning[] = [];
    const preliminary: PreliminaryRow[] = [];
    for (const [index, row] of parsed.rows.entries()) {
      const rowNumber = index + 2;
      const raw = baseImportRowSchema.safeParse(
        mappedRow(parsed, row, input.mapping),
      );
      if (!raw.success) {
        for (const issue of raw.error.issues)
          issues.push({
            rowNumber,
            field: zodField(issue.path[0]),
            message: issue.message,
          });
        continue;
      }
      let priceMinor = 0;
      try {
        priceMinor = parseDecimalToMinor(raw.data.price);
      } catch {
        issues.push({
          rowNumber,
          field: "price",
          message: "Enter a valid non-negative price with up to two decimals.",
        });
      }
      const openingStock = parseInteger(
        raw.data.openingStock,
        "openingStock",
        rowNumber,
        issues,
      );
      const reorderLevel = parseInteger(
        raw.data.reorderLevel,
        "reorderLevel",
        rowNumber,
        issues,
      );
      const status = parseStatus(raw.data.status, rowNumber, issues);
      const tagNames = raw.data.tags
        .split("|")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const normalizedTagNames = tagNames.map(normalizeTagName);
      if (
        tagNames.length > 20 ||
        new Set(normalizedTagNames).size !== tagNames.length
      )
        issues.push({
          rowNumber,
          field: "tags",
          message: "Use at most 20 unique tag names separated by |.",
        });
      preliminary.push({
        rowNumber,
        name: raw.data.name,
        sku: raw.data.sku,
        normalizedSku: raw.data.sku.toUpperCase(),
        subtitle: raw.data.subtitle,
        category: raw.data.category,
        normalizedCategory: normalizeCategoryName(raw.data.category),
        priceMinor,
        openingStock,
        reorderLevel,
        status,
        tagNames,
      });
    }

    const skuCounts = new Map<string, number>();
    for (const row of preliminary)
      skuCounts.set(
        row.normalizedSku,
        (skuCounts.get(row.normalizedSku) ?? 0) + 1,
      );
    const normalizedSkus = [...skuCounts.keys()];
    const normalizedCategoryNames = [
      ...new Set(preliminary.map((row) => row.normalizedCategory)),
    ];
    const normalizedTagNames = [
      ...new Set(
        preliminary.flatMap((row) => row.tagNames.map(normalizeTagName)),
      ),
    ];
    const [existingProducts, existingVariants, tags, categories] =
      await Promise.all([
        normalizedSkus.length === 0
          ? Promise.resolve([])
          : database
              .collection<MutableProductDocument>("products")
              .find(
                {
                  tenantId: context.tenantId,
                  normalizedSku: { $in: normalizedSkus },
                  deletedAt: { $exists: false },
                },
                {
                  projection: {
                    _id: 1,
                    normalizedSku: 1,
                    status: 1,
                    version: 1,
                  },
                },
              )
              .toArray(),
        normalizedSkus.length === 0
          ? Promise.resolve([])
          : database
              .collection<MutableVariantDocument>("productVariants")
              .find(
                {
                  tenantId: context.tenantId,
                  normalizedSku: { $in: normalizedSkus },
                  deletedAt: { $exists: false },
                },
                {
                  projection: {
                    _id: 1,
                    productId: 1,
                    normalizedSku: 1,
                    isDefault: 1,
                  },
                },
              )
              .toArray(),
        normalizedTagNames.length === 0
          ? Promise.resolve([])
          : database
              .collection<ProductTagDocument>("tags")
              .find(
                {
                  tenantId: context.tenantId,
                  normalizedName: { $in: normalizedTagNames },
                  status: "active",
                  deletedAt: { $exists: false },
                },
                { projection: { _id: 1, normalizedName: 1, name: 1 } },
              )
              .toArray(),
        normalizedCategoryNames.length === 0
          ? Promise.resolve([])
          : database
              .collection<ProductCategoryDocument>("categories")
              .find(
                {
                  tenantId: context.tenantId,
                  normalizedName: { $in: normalizedCategoryNames },
                  deletedAt: { $exists: false },
                },
                { projection: { normalizedName: 1, status: 1 } },
              )
              .toArray(),
      ]);
    const productBySku = new Map(
      existingProducts.map(
        (product) => [product.normalizedSku, product] as const,
      ),
    );
    const variantsBySku = new Map<string, MutableVariantDocument[]>();
    for (const variant of existingVariants)
      variantsBySku.set(variant.normalizedSku, [
        ...(variantsBySku.get(variant.normalizedSku) ?? []),
        variant,
      ]);
    const tagByName = new Map(
      tags.map((tag) => [tag.normalizedName, tag] as const),
    );
    const archivedCategoryNames = new Set(
      categories
        .filter((category) => category.status === "archived")
        .map((category) => category.normalizedName),
    );
    const validatedRows: ValidatedProductImportRow[] = [];
    let skipCount = 0;
    for (const row of preliminary) {
      const beforeIssueCount = issues.length;
      if ((skuCounts.get(row.normalizedSku) ?? 0) > 1)
        issues.push({
          rowNumber: row.rowNumber,
          field: "sku",
          message: "Each SKU can appear only once in an import.",
        });
      if (archivedCategoryNames.has(row.normalizedCategory))
        issues.push({
          rowNumber: row.rowNumber,
          field: "category",
          message:
            "This category is archived. Restore it or choose a new category.",
        });
      const existing = productBySku.get(row.normalizedSku);
      if (existing?.status === "archived")
        issues.push({
          rowNumber: row.rowNumber,
          field: "sku",
          message:
            "This SKU belongs to an archived product and cannot be imported.",
        });
      else if (existing && input.duplicateSkuBehavior === "reject")
        issues.push({
          rowNumber: row.rowNumber,
          field: "sku",
          message:
            "This SKU already exists. Choose skip or update to continue.",
        });
      const skuVariants = variantsBySku.get(row.normalizedSku) ?? [];
      if (
        skuVariants.some(
          (variant) => !existing || variant.productId !== existing._id,
        )
      )
        issues.push({
          rowNumber: row.rowNumber,
          field: "sku",
          message: "This SKU is already used by another product variant.",
        });
      const tagIds: string[] = [];
      for (const tagName of row.tagNames) {
        const tag = tagByName.get(normalizeTagName(tagName));
        if (!tag)
          issues.push({
            rowNumber: row.rowNumber,
            field: "tags",
            message: `Tag “${tagName}” is not active in this catalog.`,
          });
        else tagIds.push(tag._id);
      }
      if (
        existing &&
        input.duplicateSkuBehavior === "update" &&
        row.openingStock > 0
      )
        warnings.push({
          rowNumber: row.rowNumber,
          message:
            "Opening stock is ignored for an existing SKU; inventory remains unchanged.",
        });
      if (existing && input.duplicateSkuBehavior === "skip")
        warnings.push({
          rowNumber: row.rowNumber,
          message: "Existing SKU will be skipped without changing the catalog.",
        });
      const rowHasEarlierIssue = issues.some(
        (issue, issueIndex) =>
          issue.rowNumber === row.rowNumber && issueIndex < beforeIssueCount,
      );
      const rowHasNewIssue = issues.length > beforeIssueCount;
      if (rowHasEarlierIssue || rowHasNewIssue) continue;
      if (existing && input.duplicateSkuBehavior === "skip") {
        skipCount += 1;
        continue;
      }
      validatedRows.push({
        rowNumber: row.rowNumber,
        action: existing ? "update" : "create",
        productId: existing?._id,
        expectedProductVersion: existing?.version,
        name: row.name,
        sku: row.sku,
        normalizedSku: row.normalizedSku,
        subtitle: row.subtitle,
        category: row.category,
        normalizedCategory: row.normalizedCategory,
        priceMinor: row.priceMinor,
        openingStock: row.openingStock,
        reorderLevel: row.reorderLevel,
        status: row.status,
        tagIds,
      });
    }
    const createCount = validatedRows.filter(
      (row) => row.action === "create",
    ).length;
    const updateCount = validatedRows.length - createCount;
    const validation = {
      totalRows: parsed.rows.length,
      validRows: validatedRows.length + skipCount,
      createCount,
      updateCount,
      skipCount,
      issues,
      warnings,
    };
    const now = new Date();
    const update = await database
      .collection<ProductImportDocument>("productImportPreviews")
      .updateOne(
        {
          _id: preview._id,
          tenantId: context.tenantId,
          userId: context.userId,
          version: input.expectedVersion,
          status: { $in: ["uploaded", "invalid", "validated"] },
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: issues.length === 0 ? "validated" : "invalid",
            mapping: input.mapping,
            duplicateSkuBehavior: input.duplicateSkuBehavior,
            validatedRows,
            validation,
            updatedAt: now,
            updatedBy: context.userId,
          },
          $inc: { version: 1 },
        },
      );
    if (update.matchedCount !== 1) throw new ProductCsvPreviewConflictError();
    return {
      previewId: preview._id,
      version: input.expectedVersion + 1,
      ...validation,
    };
  }

  async commitImport(
    context: TenantContext,
    untrustedInput: unknown,
  ): Promise<ProductCsvImportResult> {
    requirePermission(context.permissions, "product:import");
    const input = productCsvCommitSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    await enforceCsvRateLimit(database, context, "import");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        const preview = await database
          .collection<ProductImportDocument>("productImportPreviews")
          .findOne(
            {
              _id: input.previewId,
              tenantId: context.tenantId,
              userId: context.userId,
            },
            { session },
          );
        assertCurrentPreview(preview);
        if (!preview) throw new ProductCsvPreviewNotFoundError();
        if (preview.status === "imported" && preview.result)
          return {
            previewId: preview._id,
            ...preview.result,
            alreadyImported: true,
          };
        if (
          preview.status !== "validated" ||
          preview.version !== input.expectedVersion ||
          !preview.validatedRows ||
          preview.validation?.issues.length
        )
          throw new ProductCsvValidationError();
        const { profile, planKey } = await loadProfile(
          database,
          context.tenantId,
          session,
        );
        requireTenantWriteEntitlement(profile);
        const rows = preview.validatedRows;
        const skippedCount = preview.validation?.skipCount ?? 0;
        const createdRows = rows.filter((row) => row.action === "create");
        const storeId =
          context.activeStoreId ?? [...context.allowedStoreIds][0];
        if (createdRows.length > 0 && !storeId)
          throw new ProductCsvStoreRequiredError();
        const currentUsage = await database
          .collection<MutableProductDocument>("products")
          .countDocuments(
            { tenantId: context.tenantId, deletedAt: { $exists: false } },
            { session },
          );
        assertUsageAvailable(
          planKey,
          "products",
          currentUsage,
          createdRows.length,
        );
        const distinctTagIds = [...new Set(rows.flatMap((row) => row.tagIds))];
        if (distinctTagIds.length > 0) {
          const tagCount = await database
            .collection<ProductTagDocument>("tags")
            .countDocuments(
              {
                tenantId: context.tenantId,
                _id: { $in: distinctTagIds },
                status: "active",
                deletedAt: { $exists: false },
              },
              { session },
            );
          if (tagCount !== distinctTagIds.length)
            throw new ProductCsvImportConflictError();
        }

        const categoryInputs = new Map<string, string>();
        for (const row of rows)
          if (!categoryInputs.has(row.normalizedCategory))
            categoryInputs.set(row.normalizedCategory, row.category);
        const categories =
          database.collection<ProductCategoryDocument>("categories");
        const existingCategories = await categories
          .find(
            {
              tenantId: context.tenantId,
              normalizedName: { $in: [...categoryInputs.keys()] },
              deletedAt: { $exists: false },
            },
            { session },
          )
          .toArray();
        if (existingCategories.some((category) => category.status !== "active"))
          throw new ProductCsvImportConflictError();
        const categoryNameByNormalized = new Map(
          existingCategories.map(
            (category) => [category.normalizedName, category.name] as const,
          ),
        );
        const now = new Date();
        for (const [normalizedName, name] of categoryInputs) {
          if (categoryNameByNormalized.has(normalizedName)) continue;
          const categoryId = createOpaqueId("cat");
          await categories.insertOne(
            {
              _id: categoryId,
              tenantId: context.tenantId,
              name,
              normalizedName,
              slug: createCategorySlug(name, categoryId),
              description: "",
              status: "active",
              version: 1,
              createdAt: now,
              updatedAt: now,
              createdBy: context.userId,
              updatedBy: context.userId,
            } as ProductCategoryDocument,
            { session },
          );
          categoryNameByNormalized.set(normalizedName, name);
          await appendAudit(database, context, {
            action: "category.created",
            entityType: "category",
            entityId: categoryId,
            summary: "Created a category during CSV product import.",
            changes: {
              after: { name, status: "active" },
              importId: preview._id,
            },
            now,
            session,
          });
        }

        let createdCount = 0;
        let updatedCount = 0;
        const products =
          database.collection<MutableProductDocument>("products");
        const variants =
          database.collection<MutableVariantDocument>("productVariants");
        for (const row of rows) {
          const category = categoryNameByNormalized.get(row.normalizedCategory);
          if (!category) throw new ProductCsvImportConflictError();
          if (row.action === "update") {
            if (!row.productId || !row.expectedProductVersion)
              throw new ProductCsvImportConflictError();
            const existing = await products.findOne(
              {
                _id: row.productId,
                tenantId: context.tenantId,
                normalizedSku: row.normalizedSku,
                version: row.expectedProductVersion,
                status: { $ne: "archived" },
                deletedAt: { $exists: false },
              },
              { session },
            );
            if (!existing) throw new ProductCsvImportConflictError();
            const productUpdate = await products.updateOne(
              {
                _id: existing._id,
                tenantId: context.tenantId,
                normalizedSku: row.normalizedSku,
                version: row.expectedProductVersion,
                status: { $ne: "archived" },
                deletedAt: { $exists: false },
              },
              {
                $set: {
                  name: row.name,
                  subtitle: row.subtitle,
                  sku: row.sku,
                  normalizedSku: row.normalizedSku,
                  category,
                  tagIds: row.tagIds,
                  priceMinor: row.priceMinor,
                  reorderLevel: row.reorderLevel,
                  status: row.status,
                  updatedAt: now,
                  updatedBy: context.userId,
                },
                $inc: { version: 1 },
              },
              { session },
            );
            const variantUpdate = await variants.updateOne(
              {
                _id: `${existing._id}_default`,
                tenantId: context.tenantId,
                productId: existing._id,
                isDefault: true,
              },
              {
                $set: {
                  sku: row.sku,
                  normalizedSku: row.normalizedSku,
                  priceMinor: row.priceMinor,
                  updatedAt: now,
                  updatedBy: context.userId,
                },
                $inc: { version: 1 },
              },
              { session },
            );
            if (
              productUpdate.matchedCount !== 1 ||
              variantUpdate.matchedCount !== 1
            )
              throw new ProductCsvImportConflictError();
            updatedCount += 1;
            await appendAudit(database, context, {
              action: "product.import_updated",
              entityType: "product",
              entityId: existing._id,
              summary: "Updated a catalog product through CSV import.",
              changes: {
                importId: preview._id,
                rowNumber: row.rowNumber,
                before: {
                  name: existing.name,
                  subtitle: existing.subtitle,
                  category: existing.category,
                  tagIds: existing.tagIds ?? [],
                  priceMinor: existing.priceMinor,
                  reorderLevel: existing.reorderLevel,
                  status: existing.status,
                },
                after: {
                  name: row.name,
                  subtitle: row.subtitle,
                  category,
                  tagIds: row.tagIds,
                  priceMinor: row.priceMinor,
                  reorderLevel: row.reorderLevel,
                  status: row.status,
                },
              },
              now,
              session,
            });
            continue;
          }

          if (!storeId) throw new ProductCsvStoreRequiredError();
          const duplicate = await products.findOne(
            {
              tenantId: context.tenantId,
              normalizedSku: row.normalizedSku,
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          );
          if (duplicate) throw new ProductCsvImportConflictError();
          const productId = createOpaqueId("prd");
          const variantId = `${productId}_default`;
          await database.collection<StringIdDocument>("products").insertOne(
            {
              _id: productId,
              tenantId: context.tenantId,
              name: row.name,
              subtitle: row.subtitle || "Imported product",
              type: "simple",
              optionGroups: [],
              inventoryTracking: true,
              sku: row.sku,
              normalizedSku: row.normalizedSku,
              slug:
                row.name
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/(^-|-$)/g, "") || productId,
              category,
              tagIds: row.tagIds,
              priceMinor: row.priceMinor,
              currency: profile.currency,
              stock: row.openingStock,
              reorderLevel: row.reorderLevel,
              status: row.status,
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
          await database
            .collection<StringIdDocument>("productVariants")
            .insertOne(
              {
                _id: variantId,
                tenantId: context.tenantId,
                productId,
                name: "Default",
                sku: row.sku,
                normalizedSku: row.normalizedSku,
                priceMinor: row.priceMinor,
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
              quantity: row.openingStock,
              idempotencyKey: `product-csv:${preview._id}:${row.rowNumber}`,
              now,
            },
          );
          createdCount += 1;
          await appendAudit(database, context, {
            action: "product.import_created",
            entityType: "product",
            entityId: productId,
            summary: "Created a catalog product through CSV import.",
            changes: {
              importId: preview._id,
              rowNumber: row.rowNumber,
              after: {
                category,
                tagIds: row.tagIds,
                openingStock: row.openingStock,
                storeId,
              },
            },
            now,
            session,
          });
        }

        const previewUpdate = await database
          .collection<ProductImportDocument>("productImportPreviews")
          .updateOne(
            {
              _id: preview._id,
              tenantId: context.tenantId,
              userId: context.userId,
              version: input.expectedVersion,
              status: "validated",
            },
            {
              $set: {
                status: "imported",
                result: { createdCount, updatedCount, skippedCount },
                importedAt: now,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (previewUpdate.matchedCount !== 1)
          throw new ProductCsvPreviewConflictError();
        await database
          .collection<StringIdDocument>("importExportJobs")
          .insertOne(
            {
              _id: preview._id,
              tenantId: context.tenantId,
              type: "product_csv_import",
              status: "completed",
              rowCount: preview.rowCount,
              createdCount,
              updatedCount,
              skippedCount,
              createdAt: preview.createdAt,
              createdBy: context.userId,
              completedAt: now,
              updatedAt: now,
              updatedBy: context.userId,
            },
            { session },
          );
        await appendAudit(database, context, {
          action: "product.csv_import.completed",
          entityType: "import_export_job",
          entityId: preview._id,
          summary: "Completed a bounded product CSV import.",
          changes: {
            rowCount: preview.rowCount,
            createdCount,
            updatedCount,
            skippedCount,
          },
          now,
          session,
        });
        return {
          previewId: preview._id,
          createdCount,
          updatedCount,
          skippedCount,
          alreadyImported: false,
        };
      }),
    );
    if (!result) throw new Error("Product CSV import did not complete.");
    return result;
  }

  async export(
    context: TenantContext,
    query: ProductListQuery,
  ): Promise<{ csv: string; rowCount: number }> {
    requirePermission(context.permissions, "product:export");
    const database = await getDatabase();
    await enforceCsvRateLimit(database, context, "export");
    await loadProfile(database, context.tenantId);
    const result = await new ProductRepository().exportRows(
      context,
      query,
      MAX_EXPORT_ROWS,
    );
    if (result.exceedsLimit) throw new ProductCsvExportLimitError();
    const rows: Array<Array<string | number | null>> = [
      [
        "name",
        "sku",
        "subtitle",
        "category",
        "price",
        "currency",
        "reorder_level",
        "status",
        "tags",
      ],
      ...result.rows.map((product) => [
        product.name,
        product.sku,
        product.subtitle,
        product.category,
        (product.priceMinor / 100).toFixed(2),
        product.currency,
        product.reorderLevel,
        product.status,
        product.tagNames.join("|"),
      ]),
    ];
    const now = new Date();
    const jobId = createOpaqueId("exp");
    await database.collection<StringIdDocument>("importExportJobs").insertOne({
      _id: jobId,
      tenantId: context.tenantId,
      type: "product_csv_export",
      status: "completed",
      rowCount: result.rows.length,
      filters: {
        q: query.q,
        category: query.category,
        tag: query.tag,
        stock: query.stock,
        status: query.status,
        sort: query.sort,
        direction: query.direction,
      },
      createdAt: now,
      createdBy: context.userId,
      completedAt: now,
      updatedAt: now,
      updatedBy: context.userId,
    });
    await appendAudit(database, context, {
      action: "product.csv_export.completed",
      entityType: "import_export_job",
      entityId: jobId,
      summary: "Exported the filtered product catalog as CSV.",
      changes: { rowCount: result.rows.length },
      now,
    });
    return { csv: rowsToCsv(rows), rowCount: result.rows.length };
  }
}
