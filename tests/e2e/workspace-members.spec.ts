import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { MongoClient, type Db } from "mongodb";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const enabled = process.env.RUN_WORKSPACE_E2E === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

test.describe("authenticated workspace and member administration", () => {
  test.setTimeout(90_000);
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
      "auditLogs",
      "categories",
      "invitationStoreAssignments",
      "memberStoreAssignments",
      "sessionStoreSelections",
      "stores",
      "tenantProfiles",
      "products",
      "productVariants",
      "inventoryMovements",
      "inventoryLevels",
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
        productStock: 6,
        levelQuantity: 6,
        movementCount: 1,
        auditCount: 2,
      });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
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
    await expect(page.getByText(/Second Workshop · Last 7 days/)).toBeVisible();
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
