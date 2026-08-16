import "server-only";
import type { ClientSession, Db } from "mongodb";
import { env } from "@/config/env";
import { createOpaqueId } from "@/lib/utils";
import { requireTenantWriteEntitlement } from "@/modules/billing/entitlements";
import { requirePermission } from "@/modules/permissions/permissions";
import {
  archiveOptionGroupSchema,
  archiveVariantSchema,
  createOptionGroupSchema,
  createOptionSignature,
  createVariantSchema,
  normalizeOptionLabel,
  normalizeVariantSku,
  updateOptionGroupSchema,
  updateVariantSchema,
  type ArchiveOptionGroupInput,
  type ArchiveVariantInput,
  type CreateOptionGroupInput,
  type CreateVariantInput,
  type UpdateOptionGroupInput,
  type UpdateVariantInput,
} from "@/modules/variants/schemas";
import { getMongoClient } from "@/server/db/client";
import type { TenantContext } from "@/server/tenancy/context";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface EmbeddedOptionValue {
  id: string;
  label: string;
  normalizedLabel: string;
}

interface EmbeddedOptionGroup {
  id: string;
  name: string;
  normalizedName: string;
  status: "active" | "archived";
  values: EmbeddedOptionValue[];
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  archivedAt?: Date;
  archivedBy?: string;
}

interface VariantProductDocument {
  _id: string;
  tenantId: string;
  name: string;
  status: "draft" | "active" | "archived";
  type?: "simple" | "variant" | "service";
  currency: string;
  optionGroups?: EmbeddedOptionGroup[];
  updatedAt: Date;
  updatedBy: string;
  version: number;
  deletedAt?: Date;
}

interface VariantDocument {
  _id: string;
  tenantId: string;
  productId: string;
  name: string;
  sku: string;
  normalizedSku: string;
  priceMinor: number;
  currency: string;
  status: "active" | "archived";
  isDefault: boolean;
  optionValues: Array<{ optionId: string; valueId: string }>;
  optionSignature: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  archivedAt?: Date;
  archivedBy?: string;
  deletedAt?: Date;
}

interface TenantBillingProfile {
  planKey: string;
  billingStatus?: string;
  trialEndsAt?: Date;
  graceEndsAt?: Date;
  currentPeriodEndsAt?: Date;
}

export class VariantProductNotFoundError extends Error {
  constructor() {
    super("The requested product was not found.");
    this.name = "VariantProductNotFoundError";
  }
}

export class VariantProductArchivedError extends Error {
  constructor() {
    super("Archived products cannot change variants or options.");
    this.name = "VariantProductArchivedError";
  }
}

export class ProductOptionVersionConflictError extends Error {
  constructor() {
    super("This product changed after the page was loaded.");
    this.name = "ProductOptionVersionConflictError";
  }
}

export class OptionGroupNotFoundError extends Error {
  constructor() {
    super("The requested option group was not found.");
    this.name = "OptionGroupNotFoundError";
  }
}

export class OptionGroupDuplicateError extends Error {
  constructor() {
    super("An option group with that name already exists.");
    this.name = "OptionGroupDuplicateError";
  }
}

export class OptionValueDuplicateError extends Error {
  constructor() {
    super("One or more option values already exist in this group.");
    this.name = "OptionValueDuplicateError";
  }
}

export class OptionConfigurationLockedError extends Error {
  constructor() {
    super("Add all option groups before creating sellable variants.");
    this.name = "OptionConfigurationLockedError";
  }
}

export class OptionGroupLimitError extends Error {
  constructor() {
    super("A product can have at most three option groups.");
    this.name = "OptionGroupLimitError";
  }
}

export class OptionValueLimitError extends Error {
  constructor() {
    super("An option group can have at most 20 values.");
    this.name = "OptionValueLimitError";
  }
}

export class OptionGroupInUseError extends Error {
  constructor(public readonly variantCount: number) {
    super("An option group used by active variants cannot be archived.");
    this.name = "OptionGroupInUseError";
  }
}

export class OptionSelectionInvalidError extends Error {
  constructor() {
    super("Choose one valid value from every active option group.");
    this.name = "OptionSelectionInvalidError";
  }
}

export class VariantNotFoundError extends Error {
  constructor() {
    super("The requested variant was not found.");
    this.name = "VariantNotFoundError";
  }
}

export class VariantVersionConflictError extends Error {
  constructor() {
    super("This variant changed after the page was loaded.");
    this.name = "VariantVersionConflictError";
  }
}

export class VariantArchivedError extends Error {
  constructor() {
    super("Archived variants cannot be edited.");
    this.name = "VariantArchivedError";
  }
}

export class DefaultVariantImmutableError extends Error {
  constructor() {
    super("Manage the base variant through the product details form.");
    this.name = "DefaultVariantImmutableError";
  }
}

export class VariantSkuDuplicateError extends Error {
  constructor() {
    super("That SKU is already used by another variant.");
    this.name = "VariantSkuDuplicateError";
  }
}

export class VariantCombinationDuplicateError extends Error {
  constructor() {
    super("That option combination already has a variant.");
    this.name = "VariantCombinationDuplicateError";
  }
}

export class VariantHasInventoryError extends Error {
  constructor() {
    super("A variant with inventory on hand cannot be archived.");
    this.name = "VariantHasInventoryError";
  }
}

async function requireWriteAccess(
  database: Db,
  tenantId: string,
  session: ClientSession,
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
  if (!profile) throw new VariantProductNotFoundError();
  requireTenantWriteEntitlement(profile);
}

async function findProduct(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  productId: string,
): Promise<VariantProductDocument> {
  const product = await database
    .collection<VariantProductDocument>("products")
    .findOne(
      {
        _id: productId,
        tenantId: context.tenantId,
        deletedAt: { $exists: false },
      },
      { session },
    );
  if (!product) throw new VariantProductNotFoundError();
  if (product.status === "archived") throw new VariantProductArchivedError();
  return product;
}

function assertProductVersion(
  product: VariantProductDocument,
  expectedVersion: number,
) {
  if (product.version !== expectedVersion)
    throw new ProductOptionVersionConflictError();
}

function activeGroups(product: VariantProductDocument): EmbeddedOptionGroup[] {
  return (product.optionGroups ?? []).filter(
    (group) => group.status === "active",
  );
}

async function appendAudit(
  database: Db,
  session: ClientSession,
  context: TenantContext,
  input: {
    action: string;
    entityType: "product_option_group" | "product_variant";
    entityId: string;
    summary: string;
    changes: Record<string, unknown>;
    now: Date;
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
    { session },
  );
}

export class VariantService {
  async createOptionGroup(
    context: TenantContext,
    untrustedInput: CreateOptionGroupInput,
  ): Promise<{ id: string; productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = createOptionGroupSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const optionGroupId = createOpaqueId("opt");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findProduct(
          database,
          session,
          context,
          input.productId,
        );
        assertProductVersion(product, input.expectedProductVersion);
        const groups = activeGroups(product);
        if (groups.length >= 3) throw new OptionGroupLimitError();
        const extraVariant = await database
          .collection<VariantDocument>("productVariants")
          .findOne(
            {
              tenantId: context.tenantId,
              productId: input.productId,
              isDefault: { $ne: true },
              status: "active",
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          );
        if (extraVariant) throw new OptionConfigurationLockedError();
        const normalizedName = normalizeOptionLabel(input.name);
        if (
          (product.optionGroups ?? []).some(
            (group) => group.normalizedName === normalizedName,
          )
        )
          throw new OptionGroupDuplicateError();
        const now = new Date();
        const optionGroup: EmbeddedOptionGroup = {
          id: optionGroupId,
          name: input.name,
          normalizedName,
          status: "active",
          values: input.values.map((label) => ({
            id: createOpaqueId("val"),
            label,
            normalizedLabel: normalizeOptionLabel(label),
          })),
          createdAt: now,
          createdBy: context.userId,
          updatedAt: now,
          updatedBy: context.userId,
        };
        const update = await database
          .collection<VariantProductDocument>("products")
          .updateOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              version: input.expectedProductVersion,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $push: { optionGroups: optionGroup },
              $set: { updatedAt: now, updatedBy: context.userId },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1)
          throw new ProductOptionVersionConflictError();
        await appendAudit(database, session, context, {
          action: "product.option_group.created",
          entityType: "product_option_group",
          entityId: optionGroupId,
          summary: "Created a product option group.",
          changes: {
            after: {
              productId: input.productId,
              name: input.name,
              values: input.values,
            },
          },
          now,
        });
        return {
          id: optionGroupId,
          productVersion: input.expectedProductVersion + 1,
        };
      }),
    );
    if (!result) throw new Error("Option group creation did not complete.");
    return result;
  }

  async updateOptionGroup(
    context: TenantContext,
    untrustedInput: UpdateOptionGroupInput,
  ): Promise<{ productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateOptionGroupSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findProduct(
          database,
          session,
          context,
          input.productId,
        );
        assertProductVersion(product, input.expectedProductVersion);
        const optionGroups = product.optionGroups ?? [];
        const groupIndex = optionGroups.findIndex(
          (group) => group.id === input.optionGroupId,
        );
        const existing = optionGroups[groupIndex];
        if (!existing || existing.status === "archived")
          throw new OptionGroupNotFoundError();
        const normalizedName = normalizeOptionLabel(input.name);
        if (
          optionGroups.some(
            (group) =>
              group.id !== input.optionGroupId &&
              group.normalizedName === normalizedName,
          )
        )
          throw new OptionGroupDuplicateError();
        const existingLabels = new Set(
          existing.values.map((value) => value.normalizedLabel),
        );
        if (
          input.newValues.some((value) =>
            existingLabels.has(normalizeOptionLabel(value)),
          )
        )
          throw new OptionValueDuplicateError();
        if (existing.values.length + input.newValues.length > 20)
          throw new OptionValueLimitError();
        const now = new Date();
        const updatedGroup: EmbeddedOptionGroup = {
          ...existing,
          name: input.name,
          normalizedName,
          values: [
            ...existing.values,
            ...input.newValues.map((label) => ({
              id: createOpaqueId("val"),
              label,
              normalizedLabel: normalizeOptionLabel(label),
            })),
          ],
          updatedAt: now,
          updatedBy: context.userId,
        };
        const nextGroups = [...optionGroups];
        nextGroups[groupIndex] = updatedGroup;
        const update = await database
          .collection<VariantProductDocument>("products")
          .updateOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              version: input.expectedProductVersion,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $set: {
                optionGroups: nextGroups,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1)
          throw new ProductOptionVersionConflictError();
        await appendAudit(database, session, context, {
          action: "product.option_group.updated",
          entityType: "product_option_group",
          entityId: input.optionGroupId,
          summary: "Updated a product option group.",
          changes: {
            before: { name: existing.name },
            after: { name: input.name, addedValues: input.newValues },
          },
          now,
        });
        return { productVersion: input.expectedProductVersion + 1 };
      }),
    );
    if (!result) throw new Error("Option group update did not complete.");
    return result;
  }

  async archiveOptionGroup(
    context: TenantContext,
    untrustedInput: ArchiveOptionGroupInput,
  ): Promise<{ productVersion: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "product:archive");
    const input = archiveOptionGroupSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findProduct(
          database,
          session,
          context,
          input.productId,
        );
        const optionGroups = product.optionGroups ?? [];
        const groupIndex = optionGroups.findIndex(
          (group) => group.id === input.optionGroupId,
        );
        const existing = optionGroups[groupIndex];
        if (!existing) throw new OptionGroupNotFoundError();
        if (existing.status === "archived")
          return {
            productVersion: product.version,
            alreadyArchived: true,
          };
        assertProductVersion(product, input.expectedProductVersion);
        const variantCount = await database
          .collection<VariantDocument>("productVariants")
          .countDocuments(
            {
              tenantId: context.tenantId,
              productId: input.productId,
              status: "active",
              "optionValues.optionId": input.optionGroupId,
              deletedAt: { $exists: false },
            },
            { session },
          );
        if (variantCount > 0) throw new OptionGroupInUseError(variantCount);
        const now = new Date();
        const nextGroups = [...optionGroups];
        nextGroups[groupIndex] = {
          ...existing,
          status: "archived",
          archivedAt: now,
          archivedBy: context.userId,
          updatedAt: now,
          updatedBy: context.userId,
        };
        const update = await database
          .collection<VariantProductDocument>("products")
          .updateOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              version: input.expectedProductVersion,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $set: {
                optionGroups: nextGroups,
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (update.matchedCount !== 1)
          throw new ProductOptionVersionConflictError();
        await appendAudit(database, session, context, {
          action: "product.option_group.archived",
          entityType: "product_option_group",
          entityId: input.optionGroupId,
          summary: "Archived an unused product option group.",
          changes: {
            before: { status: existing.status },
            after: { status: "archived" },
          },
          now,
        });
        return {
          productVersion: input.expectedProductVersion + 1,
          alreadyArchived: false,
        };
      }),
    );
    if (!result) throw new Error("Option group archive did not complete.");
    return result;
  }

  async createVariant(
    context: TenantContext,
    untrustedInput: CreateVariantInput,
  ): Promise<{ id: string; productVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = createVariantSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const variantId = createOpaqueId("var");
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        const product = await findProduct(
          database,
          session,
          context,
          input.productId,
        );
        assertProductVersion(product, input.expectedProductVersion);
        const groups = activeGroups(product);
        const selectionByGroup = new Map(
          input.optionValues.map((value) => [value.optionId, value.valueId]),
        );
        if (
          groups.length === 0 ||
          selectionByGroup.size !== groups.length ||
          input.optionValues.length !== groups.length
        )
          throw new OptionSelectionInvalidError();
        const resolvedValues = groups.map((group) => {
          const valueId = selectionByGroup.get(group.id);
          const value = group.values.find(
            (candidate) => candidate.id === valueId,
          );
          if (!value) throw new OptionSelectionInvalidError();
          return {
            optionId: group.id,
            optionName: group.name,
            valueId: value.id,
            valueLabel: value.label,
          };
        });
        const optionValues = resolvedValues.map(({ optionId, valueId }) => ({
          optionId,
          valueId,
        }));
        const optionSignature = createOptionSignature(optionValues);
        const variants =
          database.collection<VariantDocument>("productVariants");
        const [sameCombination, sameSku] = await Promise.all([
          variants.findOne(
            {
              tenantId: context.tenantId,
              productId: input.productId,
              optionSignature,
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          ),
          variants.findOne(
            {
              tenantId: context.tenantId,
              normalizedSku: normalizeVariantSku(input.sku),
              deletedAt: { $exists: false },
            },
            { session, projection: { _id: 1 } },
          ),
        ]);
        if (sameCombination) throw new VariantCombinationDuplicateError();
        if (sameSku) throw new VariantSkuDuplicateError();
        const now = new Date();
        const productUpdate = await database
          .collection<VariantProductDocument>("products")
          .updateOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              version: input.expectedProductVersion,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $set: {
                type: "variant",
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (productUpdate.matchedCount !== 1)
          throw new ProductOptionVersionConflictError();
        const name = resolvedValues
          .map((value) => value.valueLabel)
          .join(" / ");
        await variants.insertOne(
          {
            _id: variantId,
            tenantId: context.tenantId,
            productId: input.productId,
            name,
            sku: input.sku,
            normalizedSku: normalizeVariantSku(input.sku),
            priceMinor: input.priceMinor,
            currency: product.currency,
            status: "active",
            isDefault: false,
            optionValues,
            optionSignature,
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: context.userId,
            updatedBy: context.userId,
          },
          { session },
        );
        await appendAudit(database, session, context, {
          action: "product.variant.created",
          entityType: "product_variant",
          entityId: variantId,
          summary:
            "Created a sellable product variant without changing inventory.",
          changes: {
            after: {
              productId: input.productId,
              sku: input.sku,
              priceMinor: input.priceMinor,
              optionValues,
            },
          },
          now,
        });
        return {
          id: variantId,
          productVersion: input.expectedProductVersion + 1,
        };
      }),
    );
    if (!result) throw new Error("Variant creation did not complete.");
    return result;
  }

  async updateVariant(
    context: TenantContext,
    untrustedInput: UpdateVariantInput,
  ): Promise<{ variantVersion: number }> {
    requirePermission(context.permissions, "product:update");
    const input = updateVariantSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        await findProduct(database, session, context, input.productId);
        const variants =
          database.collection<VariantDocument>("productVariants");
        const existing = await variants.findOne(
          {
            _id: input.variantId,
            tenantId: context.tenantId,
            productId: input.productId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new VariantNotFoundError();
        if (existing.isDefault) throw new DefaultVariantImmutableError();
        if (existing.status === "archived") throw new VariantArchivedError();
        if (existing.version !== input.expectedVariantVersion)
          throw new VariantVersionConflictError();
        const normalizedSku = normalizeVariantSku(input.sku);
        const duplicate = await variants.findOne(
          {
            tenantId: context.tenantId,
            normalizedSku,
            _id: { $ne: input.variantId },
            deletedAt: { $exists: false },
          },
          { session, projection: { _id: 1 } },
        );
        if (duplicate) throw new VariantSkuDuplicateError();
        const now = new Date();
        const update = await variants.updateOne(
          {
            _id: input.variantId,
            tenantId: context.tenantId,
            productId: input.productId,
            version: input.expectedVariantVersion,
            status: "active",
            deletedAt: { $exists: false },
          },
          {
            $set: {
              sku: input.sku,
              normalizedSku,
              priceMinor: input.priceMinor,
              updatedAt: now,
              updatedBy: context.userId,
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (update.matchedCount !== 1) throw new VariantVersionConflictError();
        const productUpdate = await database
          .collection<VariantProductDocument>("products")
          .updateOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $set: { updatedAt: now, updatedBy: context.userId },
              $inc: { version: 1 },
            },
            { session },
          );
        if (productUpdate.matchedCount !== 1)
          throw new VariantProductArchivedError();
        await appendAudit(database, session, context, {
          action: "product.variant.updated",
          entityType: "product_variant",
          entityId: input.variantId,
          summary: "Updated sellable variant details.",
          changes: {
            before: { sku: existing.sku, priceMinor: existing.priceMinor },
            after: { sku: input.sku, priceMinor: input.priceMinor },
          },
          now,
        });
        return { variantVersion: input.expectedVariantVersion + 1 };
      }),
    );
    if (!result) throw new Error("Variant update did not complete.");
    return result;
  }

  async archiveVariant(
    context: TenantContext,
    untrustedInput: ArchiveVariantInput,
  ): Promise<{ variantVersion: number; alreadyArchived: boolean }> {
    requirePermission(context.permissions, "product:archive");
    const input = archiveVariantSchema.parse(untrustedInput);
    const client = await getMongoClient();
    const database = client.db(env.MONGODB_DATABASE);
    const result = await client.withSession((session) =>
      session.withTransaction(async () => {
        await requireWriteAccess(database, context.tenantId, session);
        await findProduct(database, session, context, input.productId);
        const variants =
          database.collection<VariantDocument>("productVariants");
        const existing = await variants.findOne(
          {
            _id: input.variantId,
            tenantId: context.tenantId,
            productId: input.productId,
            deletedAt: { $exists: false },
          },
          { session },
        );
        if (!existing) throw new VariantNotFoundError();
        if (existing.isDefault) throw new DefaultVariantImmutableError();
        if (existing.status === "archived")
          return {
            variantVersion: existing.version,
            alreadyArchived: true,
          };
        if (existing.version !== input.expectedVariantVersion)
          throw new VariantVersionConflictError();
        const inventory = await database
          .collection<{
            tenantId: string;
            variantId: string;
            quantity: number;
          }>("inventoryLevels")
          .aggregate<{ quantity: number }>(
            [
              {
                $match: {
                  tenantId: context.tenantId,
                  variantId: input.variantId,
                },
              },
              { $group: { _id: null, quantity: { $sum: "$quantity" } } },
            ],
            { session },
          )
          .next();
        if ((inventory?.quantity ?? 0) !== 0)
          throw new VariantHasInventoryError();
        const now = new Date();
        const archive = await variants.updateOne(
          {
            _id: input.variantId,
            tenantId: context.tenantId,
            productId: input.productId,
            version: input.expectedVariantVersion,
            status: "active",
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
        if (archive.matchedCount !== 1) throw new VariantVersionConflictError();
        const remaining = await variants.countDocuments(
          {
            tenantId: context.tenantId,
            productId: input.productId,
            _id: { $ne: input.variantId },
            isDefault: { $ne: true },
            status: "active",
            deletedAt: { $exists: false },
          },
          { session },
        );
        const productUpdate = await database
          .collection<VariantProductDocument>("products")
          .updateOne(
            {
              _id: input.productId,
              tenantId: context.tenantId,
              status: { $ne: "archived" },
              deletedAt: { $exists: false },
            },
            {
              $set: {
                type: remaining === 0 ? "simple" : "variant",
                updatedAt: now,
                updatedBy: context.userId,
              },
              $inc: { version: 1 },
            },
            { session },
          );
        if (productUpdate.matchedCount !== 1)
          throw new VariantProductArchivedError();
        await appendAudit(database, session, context, {
          action: "product.variant.archived",
          entityType: "product_variant",
          entityId: input.variantId,
          summary: "Archived a zero-stock variant without changing inventory.",
          changes: {
            before: { status: existing.status },
            after: { status: "archived" },
          },
          now,
        });
        return {
          variantVersion: input.expectedVariantVersion + 1,
          alreadyArchived: false,
        };
      }),
    );
    if (!result) throw new Error("Variant archive did not complete.");
    return result;
  }
}
