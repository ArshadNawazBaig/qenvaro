import type { Db, IndexDescription } from "mongodb";
import { getScriptDatabase } from "./shared";

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
