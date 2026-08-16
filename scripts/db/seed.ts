import { getScriptDatabase } from "./shared";
import { createHash } from "node:crypto";
import { demoProducts } from "../../src/modules/products/demo-data";
import { getDemoTags } from "../../src/modules/tags/demo-data";

const now = new Date("2026-08-16T09:00:00.000Z");
const tenantA = "org_northstar";
const tenantB = "org_harborpine";
type StringIdDocument = { _id: string } & Record<string, unknown>;

function defaultUnitId(tenantId: string): string {
  const digest = createHash("sha256")
    .update(`${tenantId}:unit:each`)
    .digest("hex");
  return `uom_${digest.slice(0, 24)}`;
}

const tenantADefaultUnitId = defaultUnitId(tenantA);
const tenantBDefaultUnitId = defaultUnitId(tenantB);

function metadata(tenantId: string, actor = "seed_system") {
  return {
    tenantId,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
    version: 1,
  };
}

function productSeedRecord(product: (typeof demoProducts)[number]) {
  const record: Record<string, unknown> = { ...product };
  delete record.primaryImage;
  record.type = product.stock === null ? "service" : "simple";
  record.inventoryTracking = product.stock !== null;
  record.taxRateBps = 0;
  return record;
}

async function main() {
  const { client, databaseName } = getScriptDatabase();
  try {
    await client.connect();
    const database = client.db(databaseName);
    await database.collection("tenantProfiles").bulkWrite([
      {
        updateOne: {
          filter: { tenantId: tenantA },
          update: {
            $set: {
              tenantId: tenantA,
              slug: "northstar-goods",
              businessName: "Northstar Goods",
              currency: "USD",
              locale: "en-US",
              timezone: "America/New_York",
              planKey: "growth",
              billingStatus: "trialing",
              billingSource: "development_seed",
              trialEndsAt: new Date("2027-08-16T09:00:00.000Z"),
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              createdBy: "seed_system",
              version: 1,
            },
          },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { tenantId: tenantB },
          update: {
            $set: {
              tenantId: tenantB,
              slug: "harbor-and-pine",
              businessName: "Harbor & Pine",
              currency: "USD",
              locale: "en-US",
              timezone: "America/Los_Angeles",
              planKey: "starter",
              billingStatus: "trialing",
              billingSource: "development_seed",
              trialEndsAt: new Date("2027-08-16T09:00:00.000Z"),
              updatedAt: now,
            },
            $setOnInsert: {
              createdAt: now,
              createdBy: "seed_system",
              version: 1,
            },
          },
          upsert: true,
        },
      },
    ]);
    await database.collection<StringIdDocument>("stores").bulkWrite([
      {
        updateOne: {
          filter: { _id: "store_northstar_downtown" },
          update: {
            $set: {
              code: "DT",
              name: "Downtown",
              status: "active",
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { _id: "store_northstar_riverside" },
          update: {
            $set: {
              code: "RV",
              name: "Riverside",
              status: "active",
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { _id: "store_harbor_main" },
          update: {
            $set: {
              code: "MAIN",
              name: "Main Store",
              status: "active",
              ...metadata(tenantB),
            },
          },
          upsert: true,
        },
      },
    ]);
    await database.collection<StringIdDocument>("units").bulkWrite([
      {
        updateOne: {
          filter: { _id: tenantADefaultUnitId, tenantId: tenantA },
          update: {
            $set: {
              name: "Each",
              normalizedName: "each",
              symbol: "ea",
              normalizedSymbol: "ea",
              slug: "each-northstar",
              description: "Default unit for individually counted products.",
              status: "active",
              isDefault: true,
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { _id: "uom_northstar_box", tenantId: tenantA },
          update: {
            $set: {
              name: "Box",
              normalizedName: "box",
              symbol: "box",
              normalizedSymbol: "box",
              slug: "box-northstar",
              description: "Products stocked and sold as a complete box.",
              status: "active",
              isDefault: false,
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      },
      {
        updateOne: {
          filter: { _id: tenantBDefaultUnitId, tenantId: tenantB },
          update: {
            $set: {
              name: "Each",
              normalizedName: "each",
              symbol: "ea",
              normalizedSymbol: "ea",
              slug: "each-harbor",
              description: "Default unit for individually counted products.",
              status: "active",
              isDefault: true,
              ...metadata(tenantB),
            },
          },
          upsert: true,
        },
      },
    ]);
    const products = demoProducts.map((product) => ({
      updateOne: {
        filter: { _id: product.id },
        update: {
          $set: {
            ...productSeedRecord(product),
            _id: product.id,
            normalizedSku: product.sku.toUpperCase(),
            type: product.stock === null ? "service" : "simple",
            inventoryTracking: product.stock !== null,
            taxRateBps: 0,
            optionGroups: [],
            unitId: tenantADefaultUnitId,
            ...metadata(tenantA),
            allowedStoreIds: [
              "store_northstar_downtown",
              "store_northstar_riverside",
            ],
          },
        },
        upsert: true,
      },
    }));
    products.push({
      updateOne: {
        filter: { _id: "prd_harbor_growth" },
        update: {
          $set: {
            _id: "prd_harbor_growth",
            id: "prd_harbor_growth",
            name: "Growth Suite",
            subtitle: "Harbor display set",
            sku: "GS-ANNUAL",
            normalizedSku: "GS-ANNUAL",
            type: "simple",
            inventoryTracking: true,
            taxRateBps: 0,
            optionGroups: [],
            unitId: tenantBDefaultUnitId,
            slug: "growth-suite",
            priceMinor: 14900,
            currency: "USD",
            stock: 38,
            reorderLevel: 8,
            category: "Fixtures",
            tagIds: [],
            status: "active",
            views: 410,
            revenueMinor: 640000,
            imageTone: "sand",
            allowedStoreIds: ["store_harbor_main"],
            ...metadata(tenantB),
          },
        },
        upsert: true,
      },
    } as (typeof products)[number]);
    await database.collection<StringIdDocument>("products").bulkWrite(products);
    const categorySeeds = [
      ...new Set(demoProducts.map((product) => product.category)),
    ].map((name) => ({ tenantId: tenantA, name }));
    categorySeeds.push({ tenantId: tenantB, name: "Fixtures" });
    await database.collection<StringIdDocument>("categories").bulkWrite(
      categorySeeds.map(({ tenantId, name }) => {
        const slugBase = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const tenantLabel = tenantId === tenantA ? "northstar" : "harbor";
        return {
          updateOne: {
            filter: {
              tenantId,
              normalizedName: name.toLowerCase(),
            },
            update: {
              $set: {
                name,
                normalizedName: name.toLowerCase(),
                slug: `${slugBase}-${tenantLabel}`,
                description: "",
                status: "active",
                ...metadata(tenantId),
              },
              $setOnInsert: {
                _id: `cat_${tenantLabel}_${slugBase.replaceAll("-", "_")}`,
              },
            },
            upsert: true,
          },
        };
      }),
    );
    await database.collection<StringIdDocument>("tags").bulkWrite(
      getDemoTags().map((tag) => ({
        updateOne: {
          filter: { _id: tag.id, tenantId: tenantA },
          update: {
            $set: {
              name: tag.name,
              normalizedName: tag.name.toLowerCase(),
              slug: tag.slug,
              description: tag.description,
              color: tag.color,
              status: tag.status,
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      })),
    );
    const fixtures = [
      [
        "customers",
        [
          {
            _id: "cus_northstar_mira",
            code: "C-1001",
            name: "Mira Cole",
            normalizedName: "mira cole",
            company: "Cole Studio",
            email: "mira@example.test",
            normalizedEmail: "mira@example.test",
            phone: "+1 212 555 0142",
            normalizedPhone: "+12125550142",
            address: {
              line1: "48 Mercer Street",
              line2: "",
              city: "New York",
              region: "NY",
              postalCode: "10013",
              countryCode: "US",
            },
            notes: "Prefers email for order updates.",
            status: "active",
            ...metadata(tenantA),
          },
          {
            _id: "cus_northstar_sana",
            code: "C-1002",
            name: "Sana Iqbal",
            normalizedName: "sana iqbal",
            company: "",
            email: "sana@example.test",
            normalizedEmail: "sana@example.test",
            phone: "+92 300 555 0171",
            normalizedPhone: "+923005550171",
            address: {
              line1: "",
              line2: "",
              city: "Karachi",
              region: "Sindh",
              postalCode: "",
              countryCode: "PK",
            },
            notes: "",
            status: "active",
            ...metadata(tenantA),
          },
          {
            _id: "cus_harbor_mira",
            code: "C-1001",
            name: "Mira Cole",
            normalizedName: "mira cole",
            company: "Harbor Guest",
            email: "mira@example.test",
            normalizedEmail: "mira@example.test",
            phone: "",
            normalizedPhone: "",
            address: {
              line1: "",
              line2: "",
              city: "Portland",
              region: "OR",
              postalCode: "",
              countryCode: "US",
            },
            notes: "",
            status: "active",
            ...metadata(tenantB),
          },
        ],
      ],
      [
        "suppliers",
        [
          {
            _id: "sup_northstar_arc",
            name: "Arc Supply Co.",
            status: "active",
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "employees",
        [
          {
            _id: "emp_northstar_lee",
            employeeCode: "NS-104",
            name: "Lee Morgan",
            status: "active",
            storeIds: ["store_northstar_downtown"],
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "attendanceRecords",
        [
          {
            _id: "att_northstar_lee_0816",
            employeeId: "emp_northstar_lee",
            storeId: "store_northstar_downtown",
            clockIn: new Date("2026-08-16T08:01:00Z"),
            status: "open",
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "salaryProfiles",
        [
          {
            _id: "sal_northstar_lee",
            employeeId: "emp_northstar_lee",
            compensationType: "monthly",
            baseAmountMinor: 460000,
            currency: "USD",
            effectiveAt: new Date("2026-01-01T00:00:00Z"),
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "payrollRuns",
        [
          {
            _id: "pay_northstar_2026_07",
            label: "July 2026",
            status: "finalized",
            totalAmountMinor: 1840000,
            currency: "USD",
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "expenses",
        [
          {
            _id: "exp_northstar_0814",
            storeId: "store_northstar_downtown",
            category: "utilities",
            vendor: "City Energy",
            amountMinor: 18420,
            currency: "USD",
            status: "approved",
            expenseDate: new Date("2026-08-14T00:00:00Z"),
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "notifications",
        [
          {
            _id: "not_northstar_stock",
            type: "low_stock",
            title: "Counter Kit is low",
            readAt: null,
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "auditLogs",
        [
          {
            _id: "aud_northstar_seed",
            action: "development.seed.applied",
            entityType: "tenant",
            entityId: tenantA,
            requestId: "seed_20260816",
            summary: "Deterministic development fixtures applied.",
            ...metadata(tenantA),
          },
        ],
      ],
    ] as const;
    for (const [collection, records] of fixtures) {
      for (const record of records)
        await database
          .collection<StringIdDocument>(collection)
          .replaceOne({ _id: record._id }, record, { upsert: true });
    }
    process.stdout.write(
      "Seeded two isolated tenants and deterministic operational demo data.\n",
    );
    process.stdout.write(
      "Authentication users are created through Better Auth; no shared seed password was written.\n",
    );
  } finally {
    await client.close();
  }
}

await main();
