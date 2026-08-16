import { createHash } from "node:crypto";
import type { AnyBulkWriteOperation, Db, IndexDescription } from "mongodb";
import { getScriptDatabase } from "./shared";

type StringIdDocument = { _id: string } & Record<string, unknown>;

interface Migration {
  version: number;
  name: string;
  run: (database: Db) => Promise<void>;
}

async function indexes(
  database: Db,
  collection: string,
  definitions: IndexDescription[],
) {
  await database.collection(collection).createIndexes(definitions);
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "core tenant indexes",
    run: async (database) => {
      await indexes(database, "organization", [
        { key: { slug: 1 }, name: "organization_slug_unique", unique: true },
      ]);
      await indexes(database, "tenantProfiles", [
        { key: { tenantId: 1 }, name: "tenant_profile_unique", unique: true },
      ]);
      await indexes(database, "stores", [
        {
          key: { tenantId: 1, code: 1 },
          name: "tenant_store_code_active_unique",
          unique: true,
          partialFilterExpression: { deletedAt: null },
        },
        { key: { tenantId: 1, status: 1 }, name: "tenant_store_status" },
      ]);
      await indexes(database, "memberStoreAssignments", [
        {
          key: { tenantId: 1, membershipId: 1, storeId: 1 },
          name: "member_store_unique",
          unique: true,
        },
      ]);
    },
  },
  {
    version: 2,
    name: "catalog and inventory indexes",
    run: async (database) => {
      await indexes(database, "products", [
        {
          key: { tenantId: 1, normalizedSku: 1 },
          name: "tenant_product_sku_active_unique",
          unique: true,
          partialFilterExpression: { deletedAt: null },
        },
        {
          key: { tenantId: 1, barcode: 1 },
          name: "tenant_product_barcode_unique",
          unique: true,
          partialFilterExpression: {
            barcode: { $type: "string" },
            deletedAt: null,
          },
        },
        {
          key: { tenantId: 1, status: 1, updatedAt: -1 },
          name: "tenant_product_status_updated",
        },
        {
          key: { tenantId: 1, category: 1, status: 1 },
          name: "tenant_product_category_status",
        },
      ]);
      await indexes(database, "productVariants", [
        {
          key: { tenantId: 1, normalizedSku: 1 },
          name: "tenant_variant_sku_unique",
          unique: true,
          partialFilterExpression: { deletedAt: null },
        },
        { key: { tenantId: 1, productId: 1 }, name: "tenant_product_variants" },
      ]);
      await indexes(database, "categories", [
        {
          key: { tenantId: 1, slug: 1 },
          name: "tenant_category_slug_active_unique",
          unique: true,
          partialFilterExpression: { deletedAt: null },
        },
      ]);
      await indexes(database, "inventoryLevels", [
        {
          key: { tenantId: 1, storeId: 1, variantId: 1 },
          name: "tenant_store_variant_level_unique",
          unique: true,
        },
      ]);
      await indexes(database, "inventoryMovements", [
        {
          key: { tenantId: 1, storeId: 1, occurredAt: -1 },
          name: "tenant_store_inventory_ledger",
        },
        {
          key: { tenantId: 1, idempotencyKey: 1 },
          name: "tenant_inventory_idempotency",
          unique: true,
        },
      ]);
    },
  },
  {
    version: 3,
    name: "operations and platform indexes",
    run: async (database) => {
      await indexes(database, "customers", [
        {
          key: { tenantId: 1, code: 1 },
          name: "tenant_customer_code_unique",
          unique: true,
          partialFilterExpression: {
            code: { $type: "string" },
            deletedAt: null,
          },
        },
      ]);
      await indexes(database, "employees", [
        {
          key: { tenantId: 1, employeeCode: 1 },
          name: "tenant_employee_code_active_unique",
          unique: true,
          partialFilterExpression: { deletedAt: null },
        },
      ]);
      await indexes(database, "sales", [
        {
          key: { tenantId: 1, storeId: 1, completedAt: -1 },
          name: "tenant_store_sales_date",
        },
        {
          key: { tenantId: 1, idempotencyKey: 1 },
          name: "tenant_sale_idempotency_unique",
          unique: true,
        },
      ]);
      await indexes(database, "sequenceCounters", [
        {
          key: { tenantId: 1, storeId: 1, sequenceType: 1 },
          name: "tenant_store_sequence_unique",
          unique: true,
        },
      ]);
      await indexes(database, "auditLogs", [
        { key: { tenantId: 1, createdAt: -1 }, name: "tenant_audit_date" },
      ]);
      await indexes(database, "webhookEvents", [
        {
          key: { provider: 1, eventId: 1 },
          name: "provider_event_unique",
          unique: true,
        },
      ]);
      await indexes(database, "usageCounters", [
        {
          key: { tenantId: 1, resource: 1 },
          name: "tenant_usage_resource_unique",
          unique: true,
        },
      ]);
    },
  },
  {
    version: 4,
    name: "onboarding and entitlement indexes",
    run: async (database) => {
      await indexes(database, "tenantProfiles", [
        { key: { slug: 1 }, name: "tenant_profile_slug_unique", unique: true },
        {
          key: { billingStatus: 1, trialEndsAt: 1 },
          name: "tenant_billing_access_expiry",
        },
      ]);
      await indexes(database, "member", [
        {
          key: { userId: 1, organizationId: 1 },
          name: "user_organization_membership",
        },
      ]);
    },
  },
  {
    version: 5,
    name: "workspace selection and member access indexes",
    run: async (database) => {
      await indexes(database, "sessionStoreSelections", [
        {
          key: { sessionId: 1, tenantId: 1 },
          name: "session_tenant_store_selection_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, membershipId: 1 },
          name: "tenant_member_store_selections",
        },
      ]);
      await indexes(database, "invitationStoreAssignments", [
        {
          key: { tenantId: 1, invitationId: 1, storeId: 1 },
          name: "invitation_store_assignment_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, invitationId: 1 },
          name: "tenant_invitation_store_assignments",
        },
      ]);
      await indexes(database, "invitation", [
        {
          key: { organizationId: 1, status: 1, expiresAt: 1 },
          name: "organization_pending_invitations",
        },
      ]);
    },
  },
  {
    version: 6,
    name: "verified billing projection indexes",
    run: async (database) => {
      await indexes(database, "tenantProfiles", [
        {
          key: { stripeSubscriptionId: 1 },
          name: "tenant_stripe_subscription_unique",
          unique: true,
          partialFilterExpression: {
            stripeSubscriptionId: { $type: "string" },
          },
        },
        {
          key: { billingStatus: 1, currentPeriodEndsAt: 1 },
          name: "tenant_billing_status_period_end",
        },
      ]);
      await indexes(database, "subscription", [
        {
          key: { stripeSubscriptionId: 1 },
          name: "stripe_subscription_unique",
          unique: true,
          partialFilterExpression: {
            stripeSubscriptionId: { $type: "string" },
          },
        },
        {
          key: { referenceId: 1, status: 1, updatedAt: -1 },
          name: "tenant_subscription_status",
        },
      ]);
      await indexes(database, "billingEvents", [
        {
          key: { provider: 1, eventId: 1 },
          name: "billing_provider_event_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, occurredAt: -1 },
          name: "tenant_billing_event_date",
        },
      ]);
      await indexes(database, "webhookEvents", [
        {
          key: { processingStatus: 1, occurredAt: -1 },
          name: "webhook_processing_status_date",
        },
      ]);
    },
  },
  {
    version: 7,
    name: "platform security and health indexes",
    run: async (database) => {
      await indexes(database, "user", [
        { key: { role: 1 }, name: "platform_user_role" },
      ]);
      await indexes(database, "tenantProfiles", [
        {
          key: { billingStatus: 1, planKey: 1 },
          name: "platform_tenant_billing_plan",
        },
      ]);
      await indexes(database, "webhookEvents", [
        {
          key: { provider: 1, verifiedAt: -1 },
          name: "platform_verified_webhook_date",
        },
      ]);
      await indexes(database, "platformSessionAssurances", [
        {
          key: { sessionId: 1 },
          name: "platform_session_assurance_unique",
          unique: true,
        },
        {
          key: { expiresAt: 1 },
          name: "platform_session_assurance_expiry",
          expireAfterSeconds: 0,
        },
      ]);
      await indexes(database, "platformAuditLogs", [
        {
          key: { idempotencyKey: 1 },
          name: "platform_audit_idempotency_unique",
          unique: true,
          partialFilterExpression: {
            idempotencyKey: { $type: "string" },
          },
        },
        { key: { createdAt: -1 }, name: "platform_audit_date" },
      ]);
    },
  },
  {
    version: 8,
    name: "catalog category lifecycle",
    run: async (database) => {
      const now = new Date();
      const assignments = await database
        .collection<{
          tenantId: string;
          category: string;
          deletedAt?: Date;
        }>("products")
        .aggregate<{ _id: { tenantId: string; category: string } }>([
          {
            $match: {
              tenantId: { $type: "string" },
              category: { $type: "string", $ne: "" },
              deletedAt: { $exists: false },
            },
          },
          { $group: { _id: { tenantId: "$tenantId", category: "$category" } } },
          { $sort: { "_id.tenantId": 1, "_id.category": 1 } },
        ])
        .toArray();
      const categories = database.collection<{
        _id: string;
        tenantId: string;
        name: string;
        normalizedName?: string;
        slug?: string;
        description?: string;
        status?: string;
        version?: number;
        createdAt?: Date;
        updatedAt?: Date;
        createdBy?: string;
        updatedBy?: string;
      }>("categories");
      for (const assignment of assignments) {
        const { tenantId, category: name } = assignment._id;
        const normalizedName = name
          .normalize("NFKC")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();
        const digest = createHash("sha256")
          .update(`${tenantId}:${normalizedName}`)
          .digest("hex");
        const slugBase = name
          .normalize("NFKD")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
          .slice(0, 60);
        const existing = await categories.findOne({
          tenantId,
          $or: [{ normalizedName }, { name }],
        });
        if (existing) {
          await categories.updateOne(
            { _id: existing._id, tenantId },
            {
              $set: {
                normalizedName,
                slug:
                  existing.slug ??
                  `${slugBase || "category"}-${digest.slice(0, 8)}`,
                description: existing.description ?? "",
                status: existing.status ?? "active",
                version: existing.version ?? 1,
                createdAt: existing.createdAt ?? now,
                updatedAt: existing.updatedAt ?? now,
                createdBy: existing.createdBy ?? "migration_8",
                updatedBy: existing.updatedBy ?? "migration_8",
              },
            },
          );
          if (existing.name !== name)
            await database.collection("products").updateMany(
              {
                tenantId,
                category: name,
                deletedAt: { $exists: false },
              },
              {
                $set: {
                  category: existing.name,
                  updatedAt: now,
                  updatedBy: "migration_8",
                },
                $inc: { version: 1 },
              },
            );
          continue;
        }
        await categories.insertOne({
          _id: `cat_${digest.slice(0, 24)}`,
          tenantId,
          name,
          normalizedName,
          slug: `${slugBase || "category"}-${digest.slice(0, 8)}`,
          description: "",
          status: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
          createdBy: "migration_8",
          updatedBy: "migration_8",
        });
      }
      await indexes(database, "categories", [
        {
          key: { tenantId: 1, normalizedName: 1 },
          name: "tenant_category_name_active_unique",
          unique: true,
          partialFilterExpression: {
            normalizedName: { $type: "string" },
            deletedAt: null,
          },
        },
        {
          key: { tenantId: 1, status: 1, updatedAt: -1 },
          name: "tenant_category_status_updated",
        },
      ]);
    },
  },
  {
    version: 9,
    name: "catalog tag lifecycle",
    run: async (database) => {
      const now = new Date();
      await database.collection("products").updateMany(
        { tagIds: { $exists: false } },
        {
          $set: {
            tagIds: [],
            updatedAt: now,
            updatedBy: "migration_9",
          },
        },
      );
      await indexes(database, "tags", [
        {
          key: { tenantId: 1, normalizedName: 1 },
          name: "tenant_tag_name_active_unique",
          unique: true,
          partialFilterExpression: {
            normalizedName: { $type: "string" },
            deletedAt: null,
          },
        },
        {
          key: { tenantId: 1, status: 1, updatedAt: -1 },
          name: "tenant_tag_status_updated",
        },
      ]);
      await indexes(database, "products", [
        {
          key: { tenantId: 1, tagIds: 1, status: 1 },
          name: "tenant_product_tag_status",
        },
      ]);
    },
  },
  {
    version: 10,
    name: "product variant and option lifecycle",
    run: async (database) => {
      await database.collection("products").updateMany(
        {
          $or: [
            { type: { $exists: false } },
            { optionGroups: { $exists: false } },
          ],
        },
        [
          {
            $set: {
              type: { $ifNull: ["$type", "simple"] },
              optionGroups: { $ifNull: ["$optionGroups", []] },
            },
          },
        ],
      );
      await database.collection("productVariants").updateMany(
        {
          $or: [
            { status: { $exists: false } },
            { isDefault: { $exists: false } },
            { optionValues: { $exists: false } },
            { optionSignature: { $exists: false } },
          ],
        },
        [
          {
            $set: {
              status: { $ifNull: ["$status", "active"] },
              isDefault: {
                $ifNull: [
                  "$isDefault",
                  { $regexMatch: { input: "$_id", regex: /_default$/ } },
                ],
              },
              optionValues: { $ifNull: ["$optionValues", []] },
              optionSignature: {
                $ifNull: ["$optionSignature", { $concat: ["legacy:", "$_id"] }],
              },
            },
          },
        ],
      );
      await indexes(database, "productVariants", [
        {
          key: { tenantId: 1, productId: 1, optionSignature: 1 },
          name: "tenant_product_variant_combination_unique",
          unique: true,
          partialFilterExpression: {
            optionSignature: { $type: "string" },
            deletedAt: null,
          },
        },
        {
          key: { tenantId: 1, productId: 1, status: 1, updatedAt: -1 },
          name: "tenant_product_variant_status_updated",
        },
      ]);
    },
  },
  {
    version: 11,
    name: "tenant product image lifecycle",
    run: async (database) => {
      await indexes(database, "productImages", [
        {
          key: { tenantId: 1, productId: 1, status: 1, position: 1 },
          name: "tenant_product_image_order",
        },
        {
          key: { tenantId: 1, cloudinaryPublicId: 1 },
          name: "tenant_cloudinary_public_id_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, productId: 1, isPrimary: 1 },
          name: "tenant_product_primary_image_unique",
          unique: true,
          partialFilterExpression: { status: "active", isPrimary: true },
        },
        {
          key: { cleanupStatus: 1, updatedAt: 1 },
          name: "product_image_cleanup_queue",
          partialFilterExpression: { cleanupStatus: "pending" },
        },
      ]);
      await indexes(database, "mediaCleanupTasks", [
        {
          key: { provider: 1, publicId: 1 },
          name: "media_cleanup_provider_public_id_unique",
          unique: true,
        },
        {
          key: { status: 1, updatedAt: 1 },
          name: "media_cleanup_pending",
        },
      ]);
    },
  },
  {
    version: 12,
    name: "bounded product csv jobs",
    run: async (database) => {
      await indexes(database, "productImportPreviews", [
        {
          key: { tenantId: 1, userId: 1, status: 1, updatedAt: -1 },
          name: "tenant_user_product_import_preview",
        },
        {
          key: { expiresAt: 1 },
          name: "product_import_preview_expiry",
          expireAfterSeconds: 0,
        },
      ]);
      await indexes(database, "importExportJobs", [
        {
          key: { tenantId: 1, type: 1, createdAt: -1 },
          name: "tenant_import_export_job_date",
        },
      ]);
    },
  },
  {
    version: 13,
    name: "application request throttles",
    run: async (database) => {
      await indexes(database, "applicationRateLimits", [
        {
          key: { expiresAt: 1 },
          name: "application_rate_limit_expiry",
          expireAfterSeconds: 0,
        },
      ]);
    },
  },
  {
    version: 14,
    name: "inventory adjustment and transfer lifecycle",
    run: async (database) => {
      await database
        .collection("inventoryLevels")
        .updateMany({ version: { $exists: false } }, { $set: { version: 1 } });
      await database
        .collection("tenantProfiles")
        .updateMany(
          { "inventorySettings.allowNegativeStock": { $exists: false } },
          { $set: { "inventorySettings.allowNegativeStock": false } },
        );
      await indexes(database, "inventoryLevels", [
        {
          key: { tenantId: 1, storeId: 1, quantity: 1 },
          name: "tenant_store_inventory_quantity",
        },
      ]);
      await indexes(database, "inventoryMovements", [
        {
          key: { tenantId: 1, variantId: 1, occurredAt: -1 },
          name: "tenant_variant_inventory_ledger",
        },
      ]);
      await indexes(database, "stockAdjustments", [
        {
          key: { tenantId: 1, idempotencyKey: 1 },
          name: "tenant_stock_adjustment_idempotency_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, storeId: 1, createdAt: -1 },
          name: "tenant_store_adjustment_date",
        },
      ]);
      await indexes(database, "stockTransfers", [
        {
          key: { tenantId: 1, idempotencyKey: 1 },
          name: "tenant_stock_transfer_idempotency_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, fromStoreId: 1, createdAt: -1 },
          name: "tenant_transfer_source_date",
        },
        {
          key: { tenantId: 1, toStoreId: 1, createdAt: -1 },
          name: "tenant_transfer_destination_date",
        },
      ]);
    },
  },
  {
    version: 15,
    name: "product store availability and inventory alert policy",
    run: async (database) => {
      await database
        .collection("tenantProfiles")
        .updateMany(
          { "inventorySettings.lowStockAlerts.enabled": { $exists: false } },
          { $set: { "inventorySettings.lowStockAlerts.enabled": false } },
        );
      await database.collection("tenantProfiles").updateMany(
        {
          "inventorySettings.lowStockAlerts.includeLowStock": {
            $exists: false,
          },
        },
        {
          $set: { "inventorySettings.lowStockAlerts.includeLowStock": true },
        },
      );
      await database.collection("tenantProfiles").updateMany(
        {
          "inventorySettings.lowStockAlerts.includeOutOfStock": {
            $exists: false,
          },
        },
        {
          $set: {
            "inventorySettings.lowStockAlerts.includeOutOfStock": true,
          },
        },
      );
      await database
        .collection("tenantProfiles")
        .updateMany(
          { "inventorySettings.lowStockAlerts.version": { $exists: false } },
          { $set: { "inventorySettings.lowStockAlerts.version": 1 } },
        );
      await indexes(database, "products", [
        {
          key: { tenantId: 1, allowedStoreIds: 1, status: 1, name: 1 },
          name: "tenant_product_store_availability",
        },
      ]);
    },
  },
  {
    version: 16,
    name: "tenant unit of measure lifecycle",
    run: async (database) => {
      const now = new Date();
      const tenants = await database
        .collection<{ tenantId: string }>("tenantProfiles")
        .find(
          { tenantId: { $type: "string" } },
          { projection: { tenantId: 1 } },
        )
        .toArray();
      for (const tenant of tenants) {
        const existing = await database
          .collection<{ _id: string }>("units")
          .findOne(
            {
              tenantId: tenant.tenantId,
              status: "active",
              deletedAt: { $exists: false },
            },
            { sort: { isDefault: -1, createdAt: 1 }, projection: { _id: 1 } },
          );
        let unitId = String(existing?._id ?? "");
        if (!unitId) {
          const digest = createHash("sha256")
            .update(`${tenant.tenantId}:unit:each`)
            .digest("hex");
          unitId = `uom_${digest.slice(0, 24)}`;
          await database
            .collection<{ _id: string } & Record<string, unknown>>("units")
            .insertOne({
              _id: unitId,
              tenantId: tenant.tenantId,
              name: "Each",
              normalizedName: "each",
              symbol: "ea",
              normalizedSymbol: "ea",
              slug: `each-${digest.slice(0, 8)}`,
              description: "Default unit for individually counted products.",
              status: "active",
              isDefault: true,
              version: 1,
              createdAt: now,
              updatedAt: now,
              createdBy: "migration_16",
              updatedBy: "migration_16",
            });
        }
        await database.collection("products").updateMany(
          {
            tenantId: tenant.tenantId,
            unitId: { $exists: false },
            deletedAt: { $exists: false },
          },
          {
            $set: {
              unitId,
              updatedAt: now,
              updatedBy: "migration_16",
            },
            $inc: { version: 1 },
          },
        );
      }
      await indexes(database, "units", [
        {
          key: { tenantId: 1, normalizedName: 1 },
          name: "tenant_unit_name_active_unique",
          unique: true,
          partialFilterExpression: {
            normalizedName: { $type: "string" },
            deletedAt: null,
          },
        },
        {
          key: { tenantId: 1, normalizedSymbol: 1 },
          name: "tenant_unit_symbol_active_unique",
          unique: true,
          partialFilterExpression: {
            normalizedSymbol: { $type: "string" },
            deletedAt: null,
          },
        },
        {
          key: { tenantId: 1, status: 1, updatedAt: -1 },
          name: "tenant_unit_status_updated",
        },
      ]);
      await indexes(database, "products", [
        {
          key: { tenantId: 1, unitId: 1, status: 1 },
          name: "tenant_product_unit_status",
        },
      ]);
    },
  },
  {
    version: 17,
    name: "tenant customer lifecycle",
    run: async (database) => {
      const customers = database.collection<StringIdDocument>("customers");
      const cursor = customers.find(
        { tenantId: { $type: "string" } },
        {
          projection: {
            tenantId: 1,
            code: 1,
            name: 1,
            company: 1,
            email: 1,
            phone: 1,
            address: 1,
            notes: 1,
            status: 1,
            version: 1,
            createdAt: 1,
            updatedAt: 1,
            createdBy: 1,
            updatedBy: 1,
          },
        },
      );
      let operations: AnyBulkWriteOperation<StringIdDocument>[] = [];
      const flush = async () => {
        if (operations.length === 0) return;
        await customers.bulkWrite(operations, { ordered: false });
        operations = [];
      };
      for await (const customer of cursor) {
        const tenantId = String(customer.tenantId);
        const name =
          typeof customer.name === "string" ? customer.name : "Customer";
        const email =
          typeof customer.email === "string"
            ? customer.email.trim().toLowerCase()
            : "";
        const phone =
          typeof customer.phone === "string" ? customer.phone.trim() : "";
        const digits = phone.replace(/\D/g, "");
        const address =
          customer.address && typeof customer.address === "object"
            ? (customer.address as Record<string, unknown>)
            : {};
        const digest = createHash("sha256")
          .update(`${tenantId}:${String(customer._id)}:customer-code`)
          .digest("hex");
        const createdAt =
          customer.createdAt instanceof Date ? customer.createdAt : new Date();
        const updatedAt =
          customer.updatedAt instanceof Date ? customer.updatedAt : createdAt;
        operations.push({
          updateOne: {
            filter: { _id: customer._id, tenantId },
            update: {
              $set: {
                code:
                  typeof customer.code === "string" && customer.code.trim()
                    ? customer.code.trim().toUpperCase()
                    : `C-${digest.slice(0, 8).toUpperCase()}`,
                name,
                normalizedName: name
                  .normalize("NFKC")
                  .trim()
                  .replace(/\s+/g, " ")
                  .toLowerCase(),
                company:
                  typeof customer.company === "string"
                    ? customer.company.trim()
                    : "",
                email,
                normalizedEmail: email,
                phone,
                normalizedPhone:
                  phone.startsWith("+") && digits ? `+${digits}` : digits,
                address: {
                  line1: typeof address.line1 === "string" ? address.line1 : "",
                  line2: typeof address.line2 === "string" ? address.line2 : "",
                  city: typeof address.city === "string" ? address.city : "",
                  region:
                    typeof address.region === "string" ? address.region : "",
                  postalCode:
                    typeof address.postalCode === "string"
                      ? address.postalCode
                      : "",
                  countryCode:
                    typeof address.countryCode === "string"
                      ? address.countryCode.toUpperCase()
                      : "",
                },
                notes: typeof customer.notes === "string" ? customer.notes : "",
                status: customer.status === "archived" ? "archived" : "active",
                version:
                  typeof customer.version === "number" && customer.version >= 1
                    ? customer.version
                    : 1,
                createdAt,
                updatedAt,
                createdBy:
                  typeof customer.createdBy === "string"
                    ? customer.createdBy
                    : "migration_17",
                updatedBy:
                  typeof customer.updatedBy === "string"
                    ? customer.updatedBy
                    : "migration_17",
              },
            },
          },
        });
        if (operations.length >= 500) await flush();
      }
      await flush();
      await indexes(database, "customers", [
        {
          key: { tenantId: 1, normalizedName: 1, _id: 1 },
          name: "tenant_customer_name",
          partialFilterExpression: { deletedAt: null },
        },
        {
          key: { tenantId: 1, status: 1, normalizedName: 1, _id: 1 },
          name: "tenant_customer_status_name",
          partialFilterExpression: { deletedAt: null },
        },
        {
          key: { tenantId: 1, updatedAt: -1, _id: 1 },
          name: "tenant_customer_updated",
          partialFilterExpression: { deletedAt: null },
        },
        {
          key: { tenantId: 1, createdAt: -1, _id: 1 },
          name: "tenant_customer_created",
          partialFilterExpression: { deletedAt: null },
        },
      ]);
    },
  },
  {
    version: 18,
    name: "atomic point of sale",
    run: async (database) => {
      const products = database.collection("products");
      await products.updateMany(
        { taxRateBps: { $exists: false } },
        { $set: { taxRateBps: 0 } },
      );
      await products.updateMany(
        { stock: { $type: "null" } },
        { $set: { type: "service", inventoryTracking: false } },
      );
      await products.updateMany(
        { stock: { $ne: null }, inventoryTracking: { $exists: false } },
        { $set: { inventoryTracking: true } },
      );
      await indexes(database, "products", [
        {
          key: { tenantId: 1, status: 1, name: 1, _id: 1 },
          name: "tenant_product_status_name",
          partialFilterExpression: { deletedAt: null },
        },
      ]);
      await indexes(database, "sales", [
        {
          key: { tenantId: 1, storeId: 1, receiptNumber: 1 },
          name: "tenant_store_receipt_unique",
          unique: true,
          partialFilterExpression: {
            receiptNumber: { $type: "string" },
          },
        },
      ]);
      await indexes(database, "salePayments", [
        {
          key: { tenantId: 1, saleId: 1, recordedAt: 1, _id: 1 },
          name: "tenant_sale_payments",
        },
      ]);
      await indexes(database, "receipts", [
        {
          key: { tenantId: 1, saleId: 1 },
          name: "tenant_sale_receipt_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, storeId: 1, receiptNumber: 1 },
          name: "tenant_receipt_number_unique",
          unique: true,
        },
      ]);
    },
  },
  {
    version: 19,
    name: "point of sale catalog access",
    run: async (database) => {
      await indexes(database, "productVariants", [
        {
          key: { tenantId: 1, status: 1, sku: 1, productId: 1, _id: 1 },
          name: "tenant_variant_pos_catalog",
          partialFilterExpression: { deletedAt: null },
        },
      ]);
    },
  },
  {
    version: 20,
    name: "sale returns and recorded refunds",
    run: async (database) => {
      const receipts = database.collection("receipts");
      await receipts.updateMany(
        { entityType: { $exists: false } },
        { $set: { entityType: "sale" } },
      );
      const receiptIndexes = await receipts.indexes();
      if (
        receiptIndexes.some(
          (index) => index.name === "tenant_sale_receipt_unique",
        )
      )
        await receipts.dropIndex("tenant_sale_receipt_unique");
      await indexes(database, "receipts", [
        {
          key: { tenantId: 1, saleId: 1 },
          name: "tenant_sale_receipt_unique",
          unique: true,
          partialFilterExpression: { entityType: "sale" },
        },
        {
          key: { tenantId: 1, returnId: 1 },
          name: "tenant_return_receipt_unique",
          unique: true,
          partialFilterExpression: { entityType: "return" },
        },
      ]);
      await indexes(database, "returns", [
        {
          key: { tenantId: 1, idempotencyKey: 1 },
          name: "tenant_return_idempotency_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, storeId: 1, returnNumber: 1 },
          name: "tenant_store_return_number_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, saleId: 1, completedAt: -1, _id: 1 },
          name: "tenant_sale_returns",
        },
      ]);
      await indexes(database, "refunds", [
        {
          key: { tenantId: 1, returnId: 1 },
          name: "tenant_return_refund_unique",
          unique: true,
        },
        {
          key: { tenantId: 1, saleId: 1, recordedAt: -1, _id: 1 },
          name: "tenant_sale_refunds",
        },
      ]);
    },
  },
];

async function main() {
  const { client, databaseName } = getScriptDatabase();
  try {
    await client.connect();
    const database = client.db(databaseName);
    const applied = database.collection<{
      version: number;
      name: string;
      appliedAt: Date;
    }>("schemaMigrations");
    for (const migration of migrations) {
      if (await applied.findOne({ version: migration.version })) continue;
      await migration.run(database);
      await applied.insertOne({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date(),
      });
      process.stdout.write(
        `Applied migration ${migration.version}: ${migration.name}\n`,
      );
    }
    process.stdout.write("Database migrations are current.\n");
  } finally {
    await client.close();
  }
}

await main();
