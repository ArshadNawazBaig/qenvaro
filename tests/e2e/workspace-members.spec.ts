import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { MongoClient, type Db } from "mongodb";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const enabled = process.env.RUN_WORKSPACE_E2E === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

test.describe("authenticated workspace and member administration", () => {
  test.setTimeout(180_000);
  test.skip(
    !enabled,
    "Set RUN_WORKSPACE_E2E=true with MongoDB and Mailpit running.",
  );

  let client: MongoClient;
  let database: Db;
  let ownerEmail = "";
  const extraUserIds: string[] = [];

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    await database.collection("rateLimit").deleteMany({
      key: { $regex: /\|\/(?:sign-up|sign-in|organization\/invite-member)/ },
    });
  });

  test.afterEach(async () => {
    if (!ownerEmail) return;
    const owner = await database
      .collection<StringDocument>("user")
      .findOne({ email: ownerEmail });
    if (!owner) return;
    const ownerId = String(owner._id);
    const memberships = await database
      .collection<StringDocument>("member")
      .find({ userId: { $in: [ownerId, ...extraUserIds] } })
      .toArray();
    const tenantIds = [
      ...new Set(memberships.map((member) => String(member.organizationId))),
    ];
    for (const collection of [
      "applicationRateLimits",
      "auditLogs",
      "categories",
      "customers",
      "importExportJobs",
      "invitationStoreAssignments",
      "memberStoreAssignments",
      "sessionStoreSelections",
      "stores",
      "tenantProfiles",
      "units",
      "products",
      "productVariants",
      "stockAdjustments",
      "stockTransfers",
      "inventoryMovements",
      "inventoryLevels",
      "productImportPreviews",
      "receipts",
      "salePayments",
      "sales",
      "sequenceCounters",
    ])
      await database.collection(collection).deleteMany({
        tenantId: { $in: tenantIds },
      });
    await database
      .collection("invitation")
      .deleteMany({ organizationId: { $in: tenantIds } });
    await database
      .collection("member")
      .deleteMany({ organizationId: { $in: tenantIds } });
    await database
      .collection<StringDocument>("organization")
      .deleteMany({ _id: { $in: tenantIds } });
    await database
      .collection("session")
      .deleteMany({ userId: { $in: [ownerId, ...extraUserIds] } });
    await database
      .collection("account")
      .deleteMany({ userId: { $in: [ownerId, ...extraUserIds] } });
    await database.collection("verification").deleteMany({
      identifier: { $in: [ownerEmail] },
    });
    await database
      .collection<StringDocument>("user")
      .deleteMany({ _id: { $in: [ownerId, ...extraUserIds] } });
    extraUserIds.length = 0;
    ownerEmail = "";
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("switches authorized business/store context and manages scoped members", async ({
    page,
  }, testInfo) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const project = testInfo.project.name
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    ownerEmail = `workspace-${project}-${suffix}@example.test`;
    const password = `Qenvaro-workspace-${suffix}!2026`;
    const primarySlug = `primary-${project}-${suffix}`;
    const secondSlug = `second-${project}-${suffix}`;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for":
        project === "mobile" ? "198.51.100.21" : "198.51.100.20",
    });

    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Morgan Owner");
    await page.getByLabel("Work email").fill(ownerEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect
      .poll(() =>
        database.collection("user").countDocuments({ email: ownerEmail }),
      )
      .toBe(1);
    await database
      .collection("user")
      .updateOne(
        { email: ownerEmail },
        { $set: { emailVerified: true, updatedAt: new Date() } },
      );
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.locator('form[data-client-ready="true"]')).toBeVisible();
    await page.getByLabel("Business name").fill("Primary Workshop");
    await page.getByLabel("Workspace URL").fill(primarySlug);
    await page.getByLabel("Store name").fill("Main Floor");
    await page.getByLabel("Store code").fill("MAIN");
    await page.getByText("Growth", { exact: true }).click();
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${primarySlug}$`), {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "Business overview" }),
    ).toBeVisible();
    await expect(page.getByText("No completed sales yet")).toBeVisible();
    await expect(page.getByText("No store sales to compare")).toBeVisible();
    await expect(page.getByText("Workspace setup completed")).toBeVisible();
    await page
      .getByRole("group", { name: "Dashboard reporting period" })
      .getByRole("link", { name: "30 days" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/app/${primarySlug}\\?range=30d$`),
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const owner = await database
      .collection<StringDocument>("user")
      .findOne({ email: ownerEmail });
    const ownerId = String(owner?._id);
    const ownerMembership = await database
      .collection<StringDocument>("member")
      .findOne({ userId: ownerId, role: "owner" });
    const primaryTenantId = String(ownerMembership?.organizationId);
    const primaryStore = await database
      .collection<StringDocument>("stores")
      .findOne({ tenantId: primaryTenantId, code: "MAIN" });

    const productName = `Counter Display ${suffix}`;
    const updatedProductName = `Counter Display Pro ${suffix}`;
    const unitName = `Case ${suffix}`;
    const unitSymbol = `cs-${suffix.slice(0, 4)}`;
    await page.goto(`/app/${primarySlug}/products`);
    await expect(
      page.getByText("Live tenant data", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Categories", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Categories", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New category" }).click();
    let categoryDialog = page.getByRole("dialog");
    await categoryDialog.getByLabel("Category name").fill("Hardware");
    await categoryDialog
      .getByLabel("Description")
      .fill("Counter and store devices.");
    await categoryDialog
      .getByRole("button", { name: "Create category" })
      .click();
    await expect(
      page.getByText("Hardware", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit Hardware" }).click();
    categoryDialog = page.getByRole("dialog");
    await categoryDialog.getByLabel("Category name").fill("Retail Hardware");
    await categoryDialog.getByRole("button", { name: "Save category" }).click();
    await expect(
      page.getByText("Retail Hardware", { exact: true }).first(),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto(`/app/${primarySlug}/products`);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "New product" }).click();
    const createProductDialog = page.getByRole("dialog");
    await createProductDialog.getByLabel("Product name").fill(productName);
    await createProductDialog.getByLabel("SKU").fill(`CD-${suffix}`);
    await createProductDialog.getByLabel("Category").fill("Retail Hardware");
    await createProductDialog.getByLabel(/Price/).fill("149.00");
    await createProductDialog.getByLabel("Opening stock").fill("6");
    await createProductDialog
      .getByRole("button", { name: "Create product" })
      .click();
    await expect(
      page.getByRole("link", { name: productName, exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: productName, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/products/prd_[A-Za-z0-9_-]+$`));
    await expect(
      page.getByRole("heading", { name: productName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("6", { exact: true }).first()).toBeVisible();

    await page.getByLabel("Product name").fill(updatedProductName);
    await page.getByLabel("Price (USD)").fill("159.00");
    await page.getByLabel("Reorder threshold").fill("3");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("heading", { name: updatedProductName, exact: true }),
    ).toBeVisible();

    const createdProduct = await database
      .collection<StringDocument>("products")
      .findOne({ tenantId: primaryTenantId, name: updatedProductName });
    expect(createdProduct).toBeTruthy();
    const productDetailUrl = page.url();

    await page.goto(`/app/${primarySlug}/products/units`);
    await expect(
      page.getByRole("heading", { name: "Units of measure", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "New unit" }).click();
    const unitDialog = page.getByRole("dialog");
    await unitDialog.getByLabel("Unit name").fill(unitName);
    await unitDialog.getByLabel("Symbol").fill(unitSymbol);
    await unitDialog
      .getByLabel("Description")
      .fill("A complete retail shipping case.");
    await unitDialog.getByRole("button", { name: "Create unit" }).click();
    await expect(
      page.getByRole("button", { name: `Edit ${unitName}` }),
    ).toBeVisible();
    const createdUnit = await database
      .collection<StringDocument>("units")
      .findOne({ tenantId: primaryTenantId, name: unitName });
    expect(createdUnit).toBeTruthy();

    await page.goto(productDetailUrl);
    await page.waitForLoadState("networkidle");
    await page
      .getByLabel("Unit of measure")
      .selectOption(String(createdUnit?._id));
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect
      .poll(async () => {
        const product = await database
          .collection<StringDocument>("products")
          .findOne({
            _id: String(createdProduct?._id),
            tenantId: primaryTenantId,
          });
        return { unitId: product?.unitId, version: product?.version };
      })
      .toEqual({ unitId: String(createdUnit?._id), version: 3 });
    await page.goto(`/app/${primarySlug}/products/units`);
    await expect(
      page.getByRole("button", { name: `Archive ${unitName}` }),
    ).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const customerName = `Amina Client ${suffix}`;
    await page.goto(`/app/${primarySlug}/customers`);
    await expect(
      page.getByRole("heading", { name: "Customers", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "New customer" }).click();
    let customerDialog = page.getByRole("dialog");
    await customerDialog.getByLabel("Customer name").fill(customerName);
    await customerDialog.getByLabel(/Company/).fill("Amina Retail Lab");
    await customerDialog
      .getByLabel(/Email/)
      .fill(`amina-${suffix}@example.test`);
    await customerDialog.getByLabel(/Phone/).fill("+92 300 555 0188");
    await customerDialog.getByLabel(/Address line 1/).fill("18 Market Road");
    await customerDialog.getByLabel("City").fill("Karachi");
    await customerDialog.getByLabel("State / region").fill("Sindh");
    await customerDialog.getByLabel("Country code").fill("PK");
    await customerDialog
      .getByLabel(/Internal notes/)
      .fill("Private browser lifecycle note");
    await customerDialog
      .getByRole("button", { name: "Create customer" })
      .click();
    await expect(
      page.getByRole("button", { name: `Edit ${customerName}` }),
    ).toBeVisible();
    await page.getByLabel("Search customers").fill(`amina-${suffix}`);
    await page.getByLabel("Search customers").press("Enter");
    await expect(page).toHaveURL(/q=amina-/);
    await expect(
      page.getByRole("button", { name: `Edit ${customerName}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: `Edit ${customerName}` }).click();
    customerDialog = page.getByRole("dialog");
    await customerDialog.getByLabel(/Company/).fill("Amina Commerce Lab");
    await customerDialog.getByRole("button", { name: "Save customer" }).click();
    await expect(
      page.locator("p:visible").filter({ hasText: /^Amina Commerce Lab$/ }),
    ).toBeVisible();

    const checkoutNote = `Private checkout ${suffix}`;
    await page.goto(`/app/${primarySlug}/sales/new`);
    await expect(
      page.getByRole("heading", { name: "New sale", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page
      .getByRole("button", { name: `Add ${updatedProductName}` })
      .click();
    const saleCustomerId = await page
      .getByLabel("Sale customer")
      .locator("option")
      .filter({ hasText: customerName })
      .getAttribute("value");
    expect(saleCustomerId).toBeTruthy();
    await page.getByLabel("Sale customer").selectOption(saleCustomerId!);
    await page.getByRole("button", { name: "Fill remaining total" }).click();
    await page.getByLabel(/Sale note/).fill(checkoutNote);
    await page.getByRole("button", { name: "Complete sale" }).click();
    await expect(page).toHaveURL(/\/sales\/sal_[A-Za-z0-9_-]+$/);
    await expect(
      page.getByRole("heading", { name: "Sale completed", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(updatedProductName, { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^MAIN-\d{6}$/).first()).toBeVisible();
    const completedSale = await database
      .collection<StringDocument>("sales")
      .findOne({ tenantId: primaryTenantId, status: "completed" });
    expect(completedSale).toMatchObject({
      customer: { name: customerName },
      subtotalMinor: 15_900,
      discountMinor: 0,
      taxMinor: 0,
      netTotalMinor: 15_900,
      totalMinor: 15_900,
      tenderedMinor: 15_900,
      changeMinor: 0,
    });
    await expect
      .poll(async () => {
        const [level, product, payment, receipt, movement, audit] =
          await Promise.all([
            database.collection<StringDocument>("inventoryLevels").findOne({
              tenantId: primaryTenantId,
              variantId: `${String(createdProduct?._id)}_default`,
            }),
            database.collection<StringDocument>("products").findOne({
              tenantId: primaryTenantId,
              _id: String(createdProduct?._id),
            }),
            database.collection<StringDocument>("salePayments").findOne({
              tenantId: primaryTenantId,
              saleId: String(completedSale?._id),
            }),
            database.collection<StringDocument>("receipts").findOne({
              tenantId: primaryTenantId,
              saleId: String(completedSale?._id),
            }),
            database.collection<StringDocument>("inventoryMovements").findOne({
              tenantId: primaryTenantId,
              sourceType: "sale",
              sourceId: String(completedSale?._id),
            }),
            database.collection<StringDocument>("auditLogs").findOne({
              tenantId: primaryTenantId,
              entityId: String(completedSale?._id),
              action: "sale.completed",
            }),
          ]);
        return {
          quantity: level?.quantity,
          levelVersion: level?.version,
          productStock: product?.stock,
          paymentMethod: payment?.method,
          paymentStatus: payment?.status,
          receiptStatus: receipt?.status,
          movementDelta: movement?.quantityDelta,
          auditText: JSON.stringify(audit),
        };
      })
      .toMatchObject({
        quantity: 5,
        levelVersion: 2,
        productStock: 5,
        paymentMethod: "cash",
        paymentStatus: "recorded",
        receiptStatus: "issued",
        movementDelta: -1,
      });
    const saleAudit = await database.collection("auditLogs").findOne({
      tenantId: primaryTenantId,
      entityId: String(completedSale?._id),
      action: "sale.completed",
    });
    const saleAuditText = JSON.stringify(saleAudit);
    for (const privateValue of [
      customerName,
      `amina-${suffix}@example.test`,
      checkoutNote,
      "cash",
      "15900",
    ])
      expect(saleAuditText).not.toContain(privateValue);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto(`/app/${primarySlug}/customers?q=amina-${suffix}`);
    await page.getByRole("button", { name: `Archive ${customerName}` }).click();
    customerDialog = page.getByRole("dialog");
    await customerDialog
      .getByRole("button", { name: "Confirm archive" })
      .click();
    await expect
      .poll(async () => {
        const customer = await database
          .collection<StringDocument>("customers")
          .findOne({ tenantId: primaryTenantId, name: customerName });
        const audits = await database
          .collection<StringDocument>("auditLogs")
          .find({ tenantId: primaryTenantId, entityId: String(customer?._id) })
          .toArray();
        return {
          status: customer?.status,
          version: customer?.version,
          auditActions: audits.map((audit) => audit.action).sort(),
          auditText: JSON.stringify(audits),
        };
      })
      .toMatchObject({
        status: "archived",
        version: 3,
        auditActions: [
          "customer.archived",
          "customer.created",
          "customer.updated",
        ],
      });
    const customerAudits = await database
      .collection("auditLogs")
      .find({ tenantId: primaryTenantId, action: /^customer\./ })
      .toArray();
    const customerAuditText = JSON.stringify(customerAudits);
    for (const privateValue of [
      customerName,
      `amina-${suffix}@example.test`,
      "+92 300 555 0188",
      "18 Market Road",
      "Private browser lifecycle note",
    ])
      expect(customerAuditText).not.toContain(privateValue);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto(`/app/${primarySlug}/products/categories`);
    await expect(
      page.getByRole("button", { name: "Archive Retail Hardware" }),
    ).toBeDisabled();
    await page.goto(productDetailUrl);
    await page.getByRole("button", { name: "Archive product" }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
    await expect(
      page.getByText("Archived products are read-only."),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const [product, level, movementCount, auditCount] = await Promise.all([
          database.collection<StringDocument>("products").findOne({
            _id: String(createdProduct?._id),
            tenantId: primaryTenantId,
          }),
          database.collection("inventoryLevels").findOne({
            tenantId: primaryTenantId,
            variantId: `${String(createdProduct?._id)}_default`,
          }),
          database.collection("inventoryMovements").countDocuments({
            tenantId: primaryTenantId,
            variantId: `${String(createdProduct?._id)}_default`,
          }),
          database.collection("auditLogs").countDocuments({
            tenantId: primaryTenantId,
            entityId: String(createdProduct?._id),
            action: { $in: ["product.updated", "product.archived"] },
          }),
        ]);
        return {
          status: product?.status,
          productStock: product?.stock,
          levelQuantity: level?.quantity,
          movementCount,
          auditCount,
        };
      })
      .toEqual({
        status: "archived",
        productStock: 5,
        levelQuantity: 5,
        movementCount: 2,
        auditCount: 3,
      });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto(`/app/${primarySlug}/products/units`);
    await page.getByRole("button", { name: `Archive ${unitName}` }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
    await expect
      .poll(async () => {
        const [unit, audit] = await Promise.all([
          database.collection<StringDocument>("units").findOne({
            _id: String(createdUnit?._id),
            tenantId: primaryTenantId,
          }),
          database.collection<StringDocument>("auditLogs").findOne({
            entityId: String(createdUnit?._id),
            tenantId: primaryTenantId,
            action: "unit.archived",
          }),
        ]);
        return {
          status: unit?.status,
          version: unit?.version,
          audited: Boolean(audit),
        };
      })
      .toEqual({ status: "archived", version: 2, audited: true });

    await page.goto(`/app/${primarySlug}/products/categories`);
    await page.getByRole("button", { name: "Archive Retail Hardware" }).click();
    await page.getByRole("button", { name: "Confirm archive" }).click();
    await expect
      .poll(async () => {
        const category = await database
          .collection<StringDocument>("categories")
          .findOne({ tenantId: primaryTenantId, name: "Retail Hardware" });
        const auditCount = await database
          .collection("auditLogs")
          .countDocuments({
            tenantId: primaryTenantId,
            entityId: String(category?._id),
            action: {
              $in: [
                "category.created",
                "category.updated",
                "category.archived",
              ],
            },
          });
        return {
          status: category?.status,
          version: category?.version,
          auditCount,
        };
      })
      .toEqual({ status: "archived", version: 3, auditCount: 3 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const csvProductName = `CSV Travel Mug ${suffix}`;
    const csvSku = `CSV-MUG-${suffix}`;
    await page.goto(`/app/${primarySlug}/products`);
    await page.getByRole("button", { name: "Import" }).click();
    const csvDialog = page.getByRole("dialog");
    const templateDownloadPromise = page.waitForEvent("download");
    await csvDialog.getByRole("button", { name: "Download template" }).click();
    expect((await templateDownloadPromise).suggestedFilename()).toBe(
      "qenvaro-product-import-template.csv",
    );
    await csvDialog.getByLabel("Product CSV file").setInputFiles({
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "name,sku,subtitle,category,price,opening_stock,reorder_level,status,tags",
          `${csvProductName},${csvSku},Imported through the browser,CSV Goods,24.50,5,2,active,`,
        ].join("\n"),
      ),
    });
    await csvDialog.getByRole("button", { name: "Preview CSV" }).click();
    await expect(csvDialog.getByText("1 product rows detected")).toBeVisible();
    await expect(csvDialog.getByLabel("Existing SKU behavior")).toHaveValue(
      "update",
    );
    await csvDialog.getByRole("button", { name: "Validate rows" }).click();
    await expect(
      csvDialog.getByRole("heading", { name: "Ready to import" }),
    ).toBeVisible();
    await csvDialog.getByRole("button", { name: "Import 1 products" }).click();
    await expect(
      csvDialog.getByRole("heading", { name: "Import completed" }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await csvDialog.getByRole("button", { name: "Return to catalog" }).click();
    await expect(
      page.getByRole("link", { name: csvProductName, exact: true }),
    ).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("products.csv");
    await expect
      .poll(async () => {
        const [product, movement, importJob, exportJob] = await Promise.all([
          database.collection<StringDocument>("products").findOne({
            tenantId: primaryTenantId,
            normalizedSku: csvSku.toUpperCase(),
          }),
          database.collection<StringDocument>("inventoryMovements").findOne({
            tenantId: primaryTenantId,
            idempotencyKey: { $regex: /^product-csv:/ },
          }),
          database.collection("importExportJobs").findOne({
            tenantId: primaryTenantId,
            type: "product_csv_import",
          }),
          database.collection("importExportJobs").findOne({
            tenantId: primaryTenantId,
            type: "product_csv_export",
          }),
        ]);
        return {
          productStock: product?.stock,
          movementQuantity: movement?.quantityDelta,
          importStatus: importJob?.status,
          exportStatus: exportJob?.status,
        };
      })
      .toEqual({
        productStock: 5,
        movementQuantity: 5,
        importStatus: "completed",
        exportStatus: "completed",
      });

    const warehouseStoreId = `store_warehouse_${project}_${suffix}`;
    const secondTenantId = `org_second_${project}_${suffix}`;
    const secondMembershipId = `member_second_${project}_${suffix}`;
    const secondStoreId = `store_second_${project}_${suffix}`;
    const teammateUserId = `user_teammate_${project}_${suffix}`;
    const teammateMemberId = `member_teammate_${project}_${suffix}`;
    extraUserIds.push(teammateUserId);
    const now = new Date();
    await database.collection<StringDocument>("organization").insertOne({
      _id: secondTenantId,
      name: "Second Workshop",
      slug: secondSlug,
      createdAt: now,
      metadata: null,
    });
    await database.collection<StringDocument>("tenantProfiles").insertOne({
      _id: `profile_second_${project}_${suffix}`,
      tenantId: secondTenantId,
      slug: secondSlug,
      businessName: "Second Workshop",
      currency: "USD",
      locale: "en-US",
      timezone: "UTC",
      planKey: "starter",
      billingStatus: "trialing",
      trialEndsAt: new Date(now.getTime() + 86_400_000),
      createdAt: now,
      updatedAt: now,
    });
    await database.collection<StringDocument>("stores").insertMany([
      {
        _id: warehouseStoreId,
        tenantId: primaryTenantId,
        code: "WH",
        name: "Warehouse",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: secondStoreId,
        tenantId: secondTenantId,
        code: "SECOND",
        name: "Second Main",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.collection<StringDocument>("member").insertMany([
      {
        _id: secondMembershipId,
        organizationId: secondTenantId,
        userId: ownerId,
        role: "owner",
        createdAt: now,
      },
      {
        _id: teammateMemberId,
        organizationId: primaryTenantId,
        userId: teammateUserId,
        role: "viewer",
        createdAt: now,
      },
    ]);
    await database.collection<StringDocument>("user").insertOne({
      _id: teammateUserId,
      name: "Taylor Teammate",
      email: `teammate-${project}-${suffix}@example.test`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await database
      .collection<StringDocument>("memberStoreAssignments")
      .insertMany([
        {
          _id: `msa_teammate_${project}_${suffix}`,
          tenantId: primaryTenantId,
          membershipId: teammateMemberId,
          storeId: String(primaryStore?._id),
          createdAt: now,
          createdBy: ownerId,
        },
        {
          _id: `msa_owner_warehouse_${project}_${suffix}`,
          tenantId: primaryTenantId,
          membershipId: String(ownerMembership?._id),
          storeId: warehouseStoreId,
          createdAt: now,
          createdBy: ownerId,
        },
      ]);
    await database
      .collection("products")
      .updateOne(
        { tenantId: primaryTenantId, normalizedSku: csvSku.toUpperCase() },
        { $addToSet: { allowedStoreIds: warehouseStoreId } },
      );

    await page.goto(`/app/${primarySlug}/inventory`);
    await expect(
      page.getByRole("heading", { name: "Inventory", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    await page.getByRole("button", { name: "New adjustment" }).click();
    let inventoryDialog = page.getByRole("dialog");
    const adjustmentVariantId = await inventoryDialog
      .getByLabel("Product / SKU")
      .locator("option")
      .filter({ hasText: csvSku })
      .getAttribute("value");
    expect(adjustmentVariantId).toBeTruthy();
    await inventoryDialog
      .getByLabel("Product / SKU")
      .selectOption(adjustmentVariantId!);
    await inventoryDialog.getByLabel("Quantity").fill("2");
    await inventoryDialog
      .getByLabel("Note")
      .fill("Browser cycle count verification");
    await inventoryDialog
      .getByRole("button", { name: "Post adjustment" })
      .click();
    await expect
      .poll(async () => {
        const [level, adjustment] = await Promise.all([
          database.collection<StringDocument>("inventoryLevels").findOne({
            tenantId: primaryTenantId,
            storeId: String(primaryStore?._id),
            variantId: adjustmentVariantId,
          }),
          database.collection<StringDocument>("stockAdjustments").findOne({
            tenantId: primaryTenantId,
            variantId: adjustmentVariantId,
          }),
        ]);
        return {
          quantity: level?.quantity,
          delta: adjustment?.quantityDelta,
          status: adjustment?.status,
        };
      })
      .toEqual({ quantity: 7, delta: 2, status: "posted" });
    await page.reload();
    await page.getByRole("button", { name: "New transfer" }).click();
    inventoryDialog = page.getByRole("dialog");
    await expect(inventoryDialog.getByLabel("From store")).toHaveValue(
      String(primaryStore?._id),
    );
    await inventoryDialog.getByLabel("To store").selectOption(warehouseStoreId);
    await inventoryDialog
      .getByLabel("SKU 1")
      .selectOption(adjustmentVariantId!);
    await inventoryDialog.getByLabel("Quantity").fill("3");
    await inventoryDialog
      .getByLabel("Transfer note")
      .fill("Browser warehouse replenishment");
    await inventoryDialog
      .getByRole("button", { name: "Complete transfer" })
      .click();
    await expect
      .poll(async () => {
        const [source, destination, transfer, movementCount] =
          await Promise.all([
            database.collection<StringDocument>("inventoryLevels").findOne({
              tenantId: primaryTenantId,
              storeId: String(primaryStore?._id),
              variantId: adjustmentVariantId,
            }),
            database.collection<StringDocument>("inventoryLevels").findOne({
              tenantId: primaryTenantId,
              storeId: warehouseStoreId,
              variantId: adjustmentVariantId,
            }),
            database.collection<StringDocument>("stockTransfers").findOne({
              tenantId: primaryTenantId,
              status: "completed",
            }),
            database.collection("inventoryMovements").countDocuments({
              tenantId: primaryTenantId,
              sourceType: "stock_transfer",
            }),
          ]);
        return {
          source: source?.quantity,
          destination: destination?.quantity,
          lineCount: (transfer?.lines as unknown[] | undefined)?.length,
          movementCount,
        };
      })
      .toEqual({ source: 4, destination: 3, lineCount: 1, movementCount: 2 });
    await page.goto(`/app/${primarySlug}/inventory/transfers`);
    await expect(
      page.getByRole("heading", { name: "Stock transfers" }),
    ).toBeVisible();
    await expect(
      page
        .locator("p:visible")
        .filter({ hasText: "Browser warehouse replenishment" }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto(`/app/${primarySlug}/inventory`);
    await page.getByRole("button", { name: "New adjustment" }).click();
    inventoryDialog = page.getByRole("dialog");
    await inventoryDialog.getByLabel("Store").selectOption(warehouseStoreId);
    await inventoryDialog
      .getByLabel("Product / SKU")
      .selectOption(adjustmentVariantId!);
    await inventoryDialog.getByLabel("Change").selectOption("set");
    await inventoryDialog.getByLabel("Quantity").fill("0");
    await inventoryDialog.getByLabel("Reason").selectOption("correction");
    await inventoryDialog
      .getByLabel("Note")
      .fill("Cleared warehouse before availability update");
    await inventoryDialog
      .getByRole("button", { name: "Post adjustment" })
      .click();
    await expect
      .poll(async () => {
        const level = await database
          .collection<StringDocument>("inventoryLevels")
          .findOne({
            tenantId: primaryTenantId,
            storeId: warehouseStoreId,
            variantId: adjustmentVariantId,
          });
        return level?.quantity;
      })
      .toBe(0);

    await page.goto(`/app/${primarySlug}/inventory/availability`);
    await expect(
      page.getByRole("heading", { name: "Product availability" }),
    ).toBeVisible();
    await page.getByLabel("Search products or SKUs").fill(csvSku);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/inventory\/availability\?q=/);
    await page.waitForLoadState("networkidle");
    const manageAvailability = page
      .locator(
        'button:visible[aria-label^="Manage availability for CSV Travel Mug"]',
      )
      .first();
    await manageAvailability.click();
    inventoryDialog = page.getByRole("dialog");
    await expect(
      inventoryDialog.getByRole("checkbox", { name: /Main Floor/ }),
    ).toBeDisabled();
    await inventoryDialog
      .getByRole("checkbox", { name: /Warehouse/ })
      .uncheck();
    await inventoryDialog
      .getByRole("button", { name: "Save availability" })
      .click();
    await expect
      .poll(async () => {
        const [product, audit] = await Promise.all([
          database.collection<StringDocument>("products").findOne({
            tenantId: primaryTenantId,
            normalizedSku: csvSku.toUpperCase(),
          }),
          database.collection<StringDocument>("auditLogs").findOne({
            tenantId: primaryTenantId,
            action: "product.store_availability.updated",
          }),
        ]);
        return {
          storeIds: product?.allowedStoreIds,
          version: product?.version,
          audited: Boolean(audit),
        };
      })
      .toEqual({
        storeIds: [String(primaryStore?._id)],
        version: 2,
        audited: true,
      });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.goto(`/app/${primarySlug}/inventory`);
    await page.getByRole("button", { name: "New adjustment" }).click();
    inventoryDialog = page.getByRole("dialog");
    await inventoryDialog
      .getByLabel("Product / SKU")
      .selectOption(adjustmentVariantId!);
    await inventoryDialog.getByLabel("Change").selectOption("set");
    await inventoryDialog.getByLabel("Quantity").fill("1");
    await inventoryDialog.getByLabel("Reason").selectOption("correction");
    await inventoryDialog
      .getByLabel("Note")
      .fill("Reduced to verify the low-stock attention queue");
    await inventoryDialog
      .getByRole("button", { name: "Post adjustment" })
      .click();
    await expect
      .poll(async () => {
        const level = await database
          .collection<StringDocument>("inventoryLevels")
          .findOne({
            tenantId: primaryTenantId,
            storeId: String(primaryStore?._id),
            variantId: adjustmentVariantId,
          });
        return level?.quantity;
      })
      .toBe(1);

    await page.goto(`/app/${primarySlug}/inventory/alerts`);
    await expect(
      page.getByRole("heading", { name: "Low-stock alerts" }),
    ).toBeVisible();
    await expect(
      page.getByText("Inventory alerts are currently disabled."),
    ).toBeVisible();
    await page.getByLabel("Enable inventory alerts").check();
    await page.getByRole("button", { name: "Save policy" }).click();
    await expect(
      page.getByRole("link", { name: csvProductName }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const [profile, audit] = await Promise.all([
          database.collection<StringDocument>("tenantProfiles").findOne({
            tenantId: primaryTenantId,
          }),
          database.collection<StringDocument>("auditLogs").findOne({
            tenantId: primaryTenantId,
            action: "inventory.low_stock_alerts.updated",
          }),
        ]);
        return {
          enabled: (
            profile?.inventorySettings as
              | { lowStockAlerts?: { enabled?: boolean; version?: number } }
              | undefined
          )?.lowStockAlerts?.enabled,
          version: (
            profile?.inventorySettings as
              | { lowStockAlerts?: { enabled?: boolean; version?: number } }
              | undefined
          )?.lowStockAlerts?.version,
          audited: Boolean(audit),
        };
      })
      .toEqual({ enabled: true, version: 2, audited: true });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBe(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.reload();
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    const sidebar = page.locator("aside:visible");
    await sidebar.getByRole("link", { name: "Team" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/${primarySlug}/settings/members$`),
    );
    await expect(
      page.getByText("Taylor Teammate", { exact: true }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByRole("button", { name: "Manage Taylor Teammate" }).click();
    await page.getByLabel("Role").selectOption("manager");
    await page.getByLabel("Grant access to Warehouse").check();
    await page.getByRole("button", { name: "Save access" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Member access updated",
    );
    await expect
      .poll(async () => {
        const member = await database
          .collection<StringDocument>("member")
          .findOne({ _id: teammateMemberId });
        const assignments = await database
          .collection("memberStoreAssignments")
          .countDocuments({
            tenantId: primaryTenantId,
            membershipId: teammateMemberId,
          });
        return { role: member?.role, assignments };
      })
      .toEqual({ role: "manager", assignments: 2 });
    await page.getByRole("button", { name: "Close dialog" }).click();

    const invitedEmail = `invite-${project}-${suffix}@example.test`;
    await page.getByRole("button", { name: "Invite member" }).click();
    await page.getByLabel("Work email").fill(invitedEmail);
    await page.getByLabel("Role").selectOption("cashier");
    await page.getByLabel("Grant access to Warehouse").check();
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("status")).toContainText("Invitation sent");
    await expect
      .poll(() =>
        database
          .collection<StringDocument>("invitation")
          .findOne({ organizationId: primaryTenantId, email: invitedEmail }),
      )
      .not.toBeNull();
    const pendingInvitation = await database
      .collection<StringDocument>("invitation")
      .findOne({ organizationId: primaryTenantId, email: invitedEmail });
    expect(
      await database.collection("invitationStoreAssignments").findOne({
        tenantId: primaryTenantId,
        invitationId: String(pendingInvitation?._id),
        storeId: warehouseStoreId,
      }),
    ).toBeTruthy();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByText(invitedEmail, { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: `Cancel invitation for ${invitedEmail}` })
      .click();
    await expect(page.getByText(invitedEmail, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Manage Taylor Teammate" }).click();
    await page.getByRole("button", { name: "Remove member" }).click();
    await page.getByRole("button", { name: "Confirm removal" }).click();
    await expect
      .poll(() =>
        database.collection<StringDocument>("member").countDocuments({
          _id: teammateMemberId,
          organizationId: primaryTenantId,
        }),
      )
      .toBe(0);
    await page.reload();
    await expect(
      page.getByText("Taylor Teammate", { exact: true }),
    ).toHaveCount(0);

    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    let activeSidebar = page.locator("aside:visible");
    await activeSidebar
      .getByRole("button", { name: /Switch store\. Current store:/ })
      .click();
    await page.getByRole("menuitem").filter({ hasText: "Warehouse" }).click();
    await expect(
      activeSidebar.getByRole("button", {
        name: "Switch store. Current store: Warehouse",
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        database.collection("sessionStoreSelections").countDocuments({
          tenantId: primaryTenantId,
          storeId: warehouseStoreId,
        }),
      )
      .toBe(1);

    await activeSidebar
      .getByRole("button", { name: "Switch business" })
      .click();
    await page
      .getByRole("menuitem")
      .filter({ hasText: "Second Workshop" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/app/${secondSlug}$`));
    await expect(
      page.getByRole("main").getByText("Second Workshop", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByText("Second Main · last 7 days"),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const activeSession = await database
          .collection("session")
          .find({ userId: ownerId })
          .sort({ updatedAt: -1 })
          .limit(1)
          .next();
        return activeSession?.activeOrganizationId;
      })
      .toBe(secondTenantId);
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    activeSidebar = page.locator("aside:visible");
    await activeSidebar
      .getByRole("button", { name: "Switch business" })
      .click();
    await expect(
      page.getByRole("menuitem").filter({ hasText: "Primary Workshop" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem").filter({ hasText: "Second Workshop" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await activeSidebar.getByRole("link", { name: "Billing" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/app/${secondSlug}/settings/billing$`),
    );
    await expect(
      page.getByRole("heading", { name: "Plans and billing" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Stripe test-mode credentials and price IDs are not configured/,
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: /Annual/ }).click();
    await expect(page.getByRole("button", { name: /Annual/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(
      page.getByRole("button", { name: "Choose Growth" }),
    ).toBeDisabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto(`/app/${secondSlug}/settings/billing?checkout=success`);
    await expect(
      page.getByText(
        /Plan access changes only after a verified Stripe webhook/,
      ),
    ).toBeVisible();
    expect(
      await database
        .collection("tenantProfiles")
        .findOne({ tenantId: secondTenantId }),
    ).toMatchObject({ planKey: "starter", billingStatus: "trialing" });
  });
});
