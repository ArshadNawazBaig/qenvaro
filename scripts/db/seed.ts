import { getScriptDatabase } from "./shared";
import { createHash } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Db } from "mongodb";
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

function defaultTaxRateId(tenantId: string): string {
  const digest = createHash("sha256")
    .update(`${tenantId}:tax:standard`)
    .digest("hex");
  return `tax_${digest.slice(0, 24)}`;
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

const seedUsers = [
  {
    id: "usr_seed_platform",
    name: "Qenvaro Platform Admin",
    email: "platform@qenvaro.example.test",
    platformRole: "PLATFORM_SUPER_ADMIN",
  },
  {
    id: "usr_seed_owner",
    name: "Nadia Owner",
    email: "owner@northstar.example.test",
  },
  {
    id: "usr_seed_admin",
    name: "Omar Admin",
    email: "admin@northstar.example.test",
  },
  {
    id: "usr_seed_manager",
    name: "Lee Morgan",
    email: "manager@northstar.example.test",
  },
  {
    id: "usr_seed_cashier",
    name: "Sara Cashier",
    email: "cashier@northstar.example.test",
  },
  {
    id: "usr_seed_inventory",
    name: "Amina Inventory",
    email: "inventory@northstar.example.test",
  },
  {
    id: "usr_seed_hr",
    name: "Hira HR",
    email: "hr@northstar.example.test",
  },
  {
    id: "usr_seed_accountant",
    name: "Farah Accountant",
    email: "accountant@northstar.example.test",
  },
  {
    id: "usr_seed_employee",
    name: "Amina Shah",
    email: "employee@northstar.example.test",
  },
] as const;

async function seedDevelopmentIdentities(database: Db) {
  await database.collection<StringIdDocument>("organization").bulkWrite([
    {
      updateOne: {
        filter: { _id: tenantA },
        update: {
          $set: { name: "Northstar Goods", slug: "northstar-goods" },
          $setOnInsert: { _id: tenantA, createdAt: now },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { _id: tenantB },
        update: {
          $set: { name: "Harbor & Pine", slug: "harbor-and-pine" },
          $setOnInsert: { _id: tenantB, createdAt: now },
        },
        upsert: true,
      },
    },
  ]);
  for (const user of seedUsers) {
    await database.collection<StringIdDocument>("user").updateOne(
      { _id: user.id },
      {
        $set: {
          name: user.name,
          email: user.email,
          emailVerified: true,
          role: "platformRole" in user ? user.platformRole : "user",
          banned: false,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: user.id,
          twoFactorEnabled: false,
          createdAt: now,
        },
      },
      { upsert: true },
    );
  }
  const password = process.env.DEVELOPMENT_SEED_PASSWORD?.trim();
  if (password) {
    if (password.length < 12)
      throw new Error(
        "DEVELOPMENT_SEED_PASSWORD must be at least 12 characters.",
      );
    for (const user of seedUsers) {
      const passwordHash = await hashPassword(password);
      await database.collection<StringIdDocument>("account").updateOne(
        { _id: `acct_${user.id}` },
        {
          $set: {
            accountId: user.id,
            providerId: "credential",
            userId: user.id,
            password: passwordHash,
            updatedAt: now,
          },
          $setOnInsert: { _id: `acct_${user.id}`, createdAt: now },
        },
        { upsert: true },
      );
    }
  }
  const memberships = [
    ["mem_seed_owner_northstar", tenantA, "usr_seed_owner", "owner"],
    ["mem_seed_owner_harbor", tenantB, "usr_seed_owner", "owner"],
    ["mem_seed_admin", tenantA, "usr_seed_admin", "admin"],
    ["mem_seed_manager", tenantA, "usr_seed_manager", "manager"],
    ["mem_seed_cashier", tenantA, "usr_seed_cashier", "cashier"],
    ["mem_seed_inventory", tenantA, "usr_seed_inventory", "inventory_manager"],
    ["mem_seed_hr", tenantA, "usr_seed_hr", "hr_manager"],
    ["mem_seed_accountant", tenantA, "usr_seed_accountant", "accountant"],
    ["mem_seed_employee", tenantA, "usr_seed_employee", "employee"],
  ] as const;
  for (const [id, organizationId, userId, role] of memberships) {
    await database.collection<StringIdDocument>("member").updateOne(
      { _id: id },
      {
        $set: { organizationId, userId, role },
        $setOnInsert: { _id: id, createdAt: now },
      },
      { upsert: true },
    );
  }
  const assignments = [
    ["msa_seed_manager", "mem_seed_manager", "store_northstar_downtown"],
    ["msa_seed_cashier", "mem_seed_cashier", "store_northstar_downtown"],
    ["msa_seed_inventory_dt", "mem_seed_inventory", "store_northstar_downtown"],
    [
      "msa_seed_inventory_rv",
      "mem_seed_inventory",
      "store_northstar_riverside",
    ],
    ["msa_seed_hr", "mem_seed_hr", "store_northstar_downtown"],
    ["msa_seed_accountant", "mem_seed_accountant", "store_northstar_downtown"],
    ["msa_seed_employee", "mem_seed_employee", "store_northstar_downtown"],
  ] as const;
  for (const [id, membershipId, storeId] of assignments) {
    await database
      .collection<StringIdDocument>("memberStoreAssignments")
      .updateOne(
        { _id: id },
        {
          $set: { tenantId: tenantA, membershipId, storeId },
          $setOnInsert: { _id: id, createdAt: now, createdBy: "seed_system" },
        },
        { upsert: true },
      );
  }
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
    await seedDevelopmentIdentities(database);
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
    await database.collection<StringIdDocument>("productVariants").bulkWrite([
      ...demoProducts.map((product) => ({
        updateOne: {
          filter: { _id: `${product.id}_default`, tenantId: tenantA },
          update: {
            $set: {
              _id: `${product.id}_default`,
              productId: product.id,
              name: "Default",
              sku: product.sku,
              normalizedSku: product.sku.toUpperCase(),
              priceMinor: product.priceMinor,
              currency: product.currency,
              status: "active",
              isDefault: true,
              optionValues: [],
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      })),
      {
        updateOne: {
          filter: {
            _id: "prd_harbor_growth_default",
            tenantId: tenantB,
          },
          update: {
            $set: {
              _id: "prd_harbor_growth_default",
              productId: "prd_harbor_growth",
              name: "Default",
              sku: "GS-ANNUAL",
              normalizedSku: "GS-ANNUAL",
              priceMinor: 14900,
              currency: "USD",
              status: "active",
              isDefault: true,
              optionValues: [],
              ...metadata(tenantB),
            },
          },
          upsert: true,
        },
      },
    ]);
    const stockedProducts = demoProducts.filter(
      (product) => product.stock !== null,
    );
    await database.collection<StringIdDocument>("inventoryLevels").bulkWrite([
      ...stockedProducts.map((product) => ({
        updateOne: {
          filter: {
            tenantId: tenantA,
            storeId: "store_northstar_downtown",
            variantId: `${product.id}_default`,
          },
          update: {
            $set: {
              _id: `lvl_seed_${product.id}_downtown`,
              quantity: product.stock ?? 0,
              ...metadata(tenantA),
            },
          },
          upsert: true,
        },
      })),
      {
        updateOne: {
          filter: {
            tenantId: tenantB,
            storeId: "store_harbor_main",
            variantId: "prd_harbor_growth_default",
          },
          update: {
            $set: {
              _id: "lvl_seed_harbor_growth",
              quantity: 38,
              ...metadata(tenantB),
            },
          },
          upsert: true,
        },
      },
    ]);
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
        "taxRates",
        [
          {
            _id: defaultTaxRateId(tenantA),
            name: "Standard",
            normalizedName: "standard",
            rateBps: 0,
            pricesIncludeTax: false,
            isDefault: true,
            status: "active",
            ...metadata(tenantA),
          },
          {
            _id: defaultTaxRateId(tenantB),
            name: "Standard",
            normalizedName: "standard",
            rateBps: 0,
            pricesIncludeTax: false,
            isDefault: true,
            status: "active",
            ...metadata(tenantB),
          },
        ],
      ],
      [
        "expenseCategories",
        [
          {
            _id: "expcat_northstar_utilities",
            name: "Utilities",
            normalizedName: "utilities",
            status: "active",
            ...metadata(tenantA),
          },
          {
            _id: "expcat_harbor_utilities",
            name: "Utilities",
            normalizedName: "utilities",
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
            supplierCode: "S-ARC00001",
            name: "Arc Supply Co.",
            normalizedName: "arc supply co.",
            contactName: "Noor Siddiqui",
            email: "orders@arc.example",
            phone: "+1 212 555 0160",
            address: "Brooklyn, New York",
            taxNumber: "DEMO-ARC-1029",
            paymentTerms: "Net 30",
            notes: "Primary store-fixture supplier.",
            status: "active",
            ...metadata(tenantA),
          },
          {
            _id: "sup_harbor_arc",
            supplierCode: "S-ARC00001",
            name: "Arc Supply Co.",
            normalizedName: "arc supply co.",
            contactName: "Harbor Account",
            email: "harbor@arc.example",
            phone: "",
            address: "Portland, Oregon",
            taxNumber: "DEMO-ARC-HP",
            paymentTerms: "Prepaid",
            notes: "",
            status: "active",
            ...metadata(tenantB),
          },
        ],
      ],
      [
        "purchaseOrders",
        [
          {
            _id: "pur_northstar_0314",
            purchaseOrderNumber: "PO-000314",
            supplierId: "sup_northstar_arc",
            supplierCode: "S-ARC00001",
            supplierName: "Arc Supply Co.",
            storeId: "store_northstar_downtown",
            expectedDeliveryDate: "2026-08-22",
            note: "Restock counter hardware.",
            currency: "USD",
            status: "partially_received",
            lines: [
              {
                lineId: "pol_northstar_0314_1",
                productId: "prd_devices",
                variantId: "prd_devices_default",
                productName: "Counter Kit",
                variantName: "Default",
                sku: "CK-HW2",
                orderedQuantity: 20,
                receivedQuantity: 10,
                unitCostMinor: 28000,
                taxRateBps: 0,
                subtotalMinor: 560000,
                taxMinor: 0,
                totalMinor: 560000,
              },
            ],
            subtotalMinor: 560000,
            taxMinor: 0,
            totalMinor: 560000,
            idempotencyKey: "00000000-0000-4000-8000-000000000314",
            requestFingerprint: "development-seed",
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "goodsReceipts",
        [
          {
            _id: "grn_northstar_0091",
            goodsReceiptNumber: "GRN-000091",
            purchaseOrderId: "pur_northstar_0314",
            purchaseOrderNumber: "PO-000314",
            supplierId: "sup_northstar_arc",
            supplierName: "Arc Supply Co.",
            storeId: "store_northstar_downtown",
            lines: [
              {
                lineId: "pol_northstar_0314_1",
                productId: "prd_devices",
                variantId: "prd_devices_default",
                productName: "Counter Kit",
                sku: "CK-HW2",
                quantity: 10,
                unitCostMinor: 28000,
              },
            ],
            note: "First delivery received.",
            receivedAt: new Date("2026-08-16T14:00:00.000Z"),
            receivedBy: "seed_system",
            purchaseStatus: "partially_received",
            idempotencyKey: "00000000-0000-4000-8000-000000000091",
            requestFingerprint: "development-seed",
            tenantId: tenantA,
            createdAt: now,
          },
        ],
      ],
      [
        "employees",
        [
          {
            _id: "emp_northstar_lee",
            employeeCode: "E-NS000104",
            name: "Lee Morgan",
            normalizedName: "lee morgan",
            workEmail: "lee@northstar.example",
            normalizedWorkEmail: "lee@northstar.example",
            phone: "+1 212 555 0188",
            jobTitle: "Store manager",
            department: "Retail operations",
            employmentType: "full_time",
            hireDate: "2024-03-11",
            status: "active",
            storeIds: ["store_northstar_downtown"],
            ...metadata(tenantA),
          },
          {
            _id: "emp_northstar_amina",
            userId: "usr_seed_employee",
            employeeCode: "E-NS000105",
            name: "Amina Shah",
            normalizedName: "amina shah",
            workEmail: "amina@northstar.example",
            normalizedWorkEmail: "amina@northstar.example",
            phone: "+1 212 555 0190",
            jobTitle: "Inventory coordinator",
            department: "Supply chain",
            employmentType: "full_time",
            hireDate: "2025-01-20",
            status: "active",
            storeIds: ["store_northstar_downtown", "store_northstar_riverside"],
            ...metadata(tenantA),
          },
          {
            _id: "emp_harbor_lee",
            employeeCode: "E-HP000104",
            name: "Lee Morgan",
            normalizedName: "lee morgan",
            workEmail: "lee@harbor.example",
            normalizedWorkEmail: "lee@harbor.example",
            phone: "",
            jobTitle: "Sales associate",
            department: "Retail",
            employmentType: "part_time",
            hireDate: "2025-09-01",
            status: "active",
            storeIds: ["store_harbor_main"],
            ...metadata(tenantB),
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
            workDate: "2026-08-16",
            clockIn: "2026-08-16T12:01:00.000Z",
            clockOut: "2026-08-16T20:07:00.000Z",
            breakMinutes: 45,
            workedMinutes: 441,
            status: "present",
            note: "",
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "leaveRequests",
        [
          {
            _id: "lea_northstar_amina_0820",
            employeeId: "emp_northstar_amina",
            type: "annual",
            fromDate: "2026-08-20",
            toDate: "2026-08-22",
            days: 3,
            reason: "Planned leave",
            status: "approved",
            decisionNote: "Store coverage confirmed.",
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
            allowanceMinor: 35000,
            deductionMinor: 12000,
            overtimeRateMinor: 3200,
            effectiveDate: "2026-01-01",
            paySchedule: "monthly",
            tenantId: tenantA,
            createdAt: now,
            createdBy: "seed_system",
          },
          {
            _id: "sal_northstar_amina",
            employeeId: "emp_northstar_amina",
            compensationType: "monthly",
            baseAmountMinor: 420000,
            allowanceMinor: 25000,
            deductionMinor: 9000,
            overtimeRateMinor: 2800,
            effectiveDate: "2026-01-01",
            paySchedule: "monthly",
            tenantId: tenantA,
            createdAt: now,
            createdBy: "seed_system",
          },
        ],
      ],
      [
        "payrollRuns",
        [
          {
            _id: "pay_northstar_2026_07",
            runNumber: "PAY-000127",
            storeId: "store_northstar_downtown",
            scopeStoreIds: ["store_northstar_downtown"],
            periodStart: "2026-07-01",
            periodEnd: "2026-07-31",
            payDate: "2026-08-01",
            status: "finalized",
            employeeCount: 2,
            grossMinor: 940000,
            deductionMinor: 21000,
            netMinor: 919000,
            currency: "USD",
            requestFingerprint: "development-seed",
            idempotencyKey: "00000000-0000-4000-8000-000000000127",
            finalizedAt: now,
            ...metadata(tenantA),
          },
        ],
      ],
      [
        "payrollItems",
        [
          {
            _id: "pit_northstar_lee_2026_07",
            payrollRunId: "pay_northstar_2026_07",
            employeeId: "emp_northstar_lee",
            employeeCode: "E-NS000104",
            employeeName: "Lee Morgan",
            compensationType: "monthly",
            baseMinor: 460000,
            allowanceMinor: 35000,
            overtimeMinor: 0,
            deductionMinor: 12000,
            grossMinor: 495000,
            netMinor: 483000,
            workedMinutes: 0,
            overtimeMinutes: 0,
            payableDays: 0,
            status: "finalized",
            tenantId: tenantA,
            createdAt: now,
          },
          {
            _id: "pit_northstar_amina_2026_07",
            payrollRunId: "pay_northstar_2026_07",
            employeeId: "emp_northstar_amina",
            employeeCode: "E-NS000105",
            employeeName: "Amina Shah",
            compensationType: "monthly",
            baseMinor: 420000,
            allowanceMinor: 25000,
            overtimeMinor: 0,
            deductionMinor: 9000,
            grossMinor: 445000,
            netMinor: 436000,
            workedMinutes: 0,
            overtimeMinutes: 0,
            payableDays: 0,
            status: "finalized",
            tenantId: tenantA,
            createdAt: now,
          },
        ],
      ],
      [
        "payslips",
        [
          {
            _id: "psl_northstar_lee_2026_07",
            payrollRunId: "pay_northstar_2026_07",
            runNumber: "PAY-000127",
            employeeId: "emp_northstar_lee",
            employeeCode: "E-NS000104",
            employeeName: "Lee Morgan",
            periodStart: "2026-07-01",
            periodEnd: "2026-07-31",
            payDate: "2026-08-01",
            currency: "USD",
            baseMinor: 460000,
            allowanceMinor: 35000,
            overtimeMinor: 0,
            deductionMinor: 12000,
            netMinor: 483000,
            finalizedAt: now,
            status: "finalized",
            tenantId: tenantA,
            createdAt: now,
          },
          {
            _id: "psl_northstar_amina_2026_07",
            payrollRunId: "pay_northstar_2026_07",
            runNumber: "PAY-000127",
            employeeId: "emp_northstar_amina",
            employeeCode: "E-NS000105",
            employeeName: "Amina Shah",
            periodStart: "2026-07-01",
            periodEnd: "2026-07-31",
            payDate: "2026-08-01",
            currency: "USD",
            baseMinor: 420000,
            allowanceMinor: 25000,
            overtimeMinor: 0,
            deductionMinor: 9000,
            netMinor: 436000,
            finalizedAt: now,
            status: "finalized",
            tenantId: tenantA,
            createdAt: now,
          },
        ],
      ],
      [
        "expenses",
        [
          {
            _id: "exp_northstar_0814",
            expenseNumber: "EXP-000481",
            storeId: "store_northstar_downtown",
            category: "Utilities",
            normalizedCategory: "utilities",
            vendor: "City Energy",
            normalizedVendor: "city energy",
            amountMinor: 18420,
            currency: "USD",
            status: "approved",
            expenseDate: "2026-08-14",
            notes: "August electricity service.",
            receiptUrl: "",
            decisionNote: "Matched to statement.",
            idempotencyKey: "00000000-0000-4000-8000-000000000481",
            requestFingerprint: "development-seed",
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
            message:
              "Counter Kit has reached its reorder threshold at Downtown.",
            severity: "warning",
            href: "/app/northstar-goods/inventory/alerts",
            audience: "all",
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
    await database
      .collection<StringIdDocument>("platformFeatureFlags")
      .replaceOne(
        { _id: "flag_seed_dashboard_insights" },
        {
          _id: "flag_seed_dashboard_insights",
          key: "beta_dashboard_insights",
          description:
            "Controlled rollout for future dashboard insight modules.",
          defaultEnabled: false,
          status: "active",
          version: 1,
          createdBy: "development_seed",
          createdAt: now,
        },
        { upsert: true },
      );
    await database
      .collection<StringIdDocument>("platformAnnouncements")
      .replaceOne(
        { _id: "announce_seed_welcome" },
        {
          _id: "announce_seed_welcome",
          title: "Welcome to the operations workspace",
          message:
            "Your notification center now combines tenant alerts with time-bounded platform updates.",
          severity: "info",
          href: "/pricing",
          status: "published",
          startsAt: new Date("2026-08-01T00:00:00.000Z"),
          endsAt: new Date("2026-09-01T00:00:00.000Z"),
          createdBy: "development_seed",
          createdAt: now,
        },
        { upsert: true },
      );
    process.stdout.write(
      "Seeded two isolated tenants and deterministic operational demo data.\n",
    );
    process.stdout.write(
      process.env.DEVELOPMENT_SEED_PASSWORD?.trim()
        ? "Seeded verified development identities with environment-provided credentials.\n"
        : "Seeded verified development identities without credentials; set DEVELOPMENT_SEED_PASSWORD to enable local login.\n",
    );
  } finally {
    await client.close();
  }
}

await main();
