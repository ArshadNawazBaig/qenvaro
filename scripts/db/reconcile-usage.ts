import type { Db } from "mongodb";
import { getScriptDatabase } from "./shared";

async function countsBy(
  database: Db,
  collection: string,
  tenantField: string,
  match: Record<string, unknown> = {},
) {
  const rows = await database
    .collection(collection)
    .aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: `$${tenantField}`, count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row.count]));
}

async function main() {
  const { client, databaseName } = getScriptDatabase({ allowProduction: true });
  try {
    await client.connect();
    const database = client.db(databaseName);
    const tenants = await database
      .collection<{ tenantId: string }>("tenantProfiles")
      .find({}, { projection: { tenantId: 1 } })
      .toArray();
    const now = new Date();
    const [stores, products, members, invitations] = await Promise.all([
      countsBy(database, "stores", "tenantId", {
        status: "active",
        deletedAt: { $exists: false },
      }),
      countsBy(database, "products", "tenantId", {
        deletedAt: { $exists: false },
      }),
      countsBy(database, "member", "organizationId"),
      countsBy(database, "invitation", "organizationId", {
        status: "pending",
        expiresAt: { $gt: now },
      }),
    ]);
    const operations = tenants.flatMap((tenant) => {
      const values = {
        stores: stores.get(tenant.tenantId) ?? 0,
        products: products.get(tenant.tenantId) ?? 0,
        members:
          (members.get(tenant.tenantId) ?? 0) +
          (invitations.get(tenant.tenantId) ?? 0),
      };
      return Object.entries(values).map(([resource, value]) => ({
        updateOne: {
          filter: { _id: `${tenant.tenantId}:${resource}` },
          update: {
            $set: {
              tenantId: tenant.tenantId,
              resource,
              value,
              reconciledAt: now,
              updatedAt: now,
            },
            $setOnInsert: { createdAt: now },
          },
          upsert: true,
        },
      }));
    });
    if (operations.length > 0)
      await database
        .collection<{ _id: string } & Record<string, unknown>>("usageCounters")
        .bulkWrite(operations);
    process.stdout.write(
      `Reconciled ${operations.length} usage counters across ${tenants.length} tenants.\n`,
    );
  } finally {
    await client.close();
  }
}

await main();
