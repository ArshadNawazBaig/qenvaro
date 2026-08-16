import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { MongoClient, type Db } from "mongodb";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const enabled = process.env.RUN_ONBOARDING_E2E === "true";
type StringIdDocument = { _id: string } & Record<string, unknown>;

test.describe("authenticated first-workspace onboarding", () => {
  test.skip(
    !enabled,
    "Set RUN_ONBOARDING_E2E=true with the local replica set running.",
  );

  let client: MongoClient;
  let database: Db;
  let email = "";

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    await database.collection("rateLimit").deleteMany({
      key: { $regex: /\|\/sign-(?:up|in)\/email$/ },
    });
  });

  test.afterEach(async () => {
    if (!email) return;
    const user = await database
      .collection<StringIdDocument>("user")
      .findOne({ email });
    if (!user) return;
    const userId = String(user._id);
    const memberships = await database
      .collection<StringIdDocument>("member")
      .find({ userId })
      .toArray();
    const tenantIds = memberships.map((member) =>
      String(member.organizationId),
    );
    for (const collection of [
      "auditLogs",
      "memberStoreAssignments",
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
    await database.collection("member").deleteMany({ userId });
    await database.collection("invitation").deleteMany({
      organizationId: { $in: tenantIds },
    });
    await database
      .collection<StringIdDocument>("organization")
      .deleteMany({ _id: { $in: tenantIds } });
    await database.collection("session").deleteMany({ userId });
    await database.collection("account").deleteMany({ userId });
    await database.collection("verification").deleteMany({ identifier: email });
    await database
      .collection<StringIdDocument>("user")
      .deleteOne({ _id: userId });
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("creates the Better Auth organization and transactional Qenvaro workspace", async ({
    page,
  }, testInfo) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const project = testInfo.project.name
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    email = `onboarding-${project}-${suffix}@example.test`;
    const password = `Qenvaro-test-${suffix}!2026`;
    const slug = `atelier-${project}-${suffix}`;
    await page.setExtraHTTPHeaders({
      "x-forwarded-for":
        project === "mobile" ? "198.51.100.11" : "198.51.100.10",
    });

    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Jamie Rivera");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your inbox", {
      timeout: 20_000,
    });

    await expect
      .poll(async () =>
        database.collection<StringIdDocument>("user").findOne({ email }),
      )
      .not.toBeNull();
    await database
      .collection<StringIdDocument>("user")
      .updateOne(
        { email },
        { $set: { emailVerified: true, updatedAt: new Date() } },
      );

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.locator('form[data-client-ready="true"]')).toBeVisible();

    await page.getByLabel("Business name").fill("Rivera Atelier");
    await page.getByLabel("Workspace URL").fill(slug);
    await page.getByLabel("Currency").selectOption("PKR");
    await page.getByLabel("Language and format").selectOption("ur-PK");
    await page.getByLabel("Timezone").fill("Asia/Karachi");
    await page.getByLabel("Store name").fill("Clifton Store");
    await page.getByLabel("Store code").fill("CLIFTON");
    await page.getByText("Growth", { exact: true }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.locator("form :invalid").evaluateAll((elements) =>
        elements.map((element) => ({
          name: (element as HTMLInputElement).name,
          message: (element as HTMLInputElement).validationMessage,
        })),
      ),
    ).toEqual([]);

    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/${slug}$`), {
      timeout: 20_000,
    });
    await expect(page.getByText(/Rivera Atelier · Last 7 days/)).toBeVisible();
    if (testInfo.project.name === "mobile")
      await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page.locator("aside:visible").getByRole("button", {
        name: "Switch store. Current store: Clifton Store",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Live tenant data", { exact: true }),
    ).toBeVisible();

    const user = await database
      .collection<StringIdDocument>("user")
      .findOne({ email });
    const membership = await database
      .collection<StringIdDocument>("member")
      .findOne({ userId: String(user?._id), role: "owner" });
    const tenantId = String(membership?.organizationId);
    const [profile, store, assignment, audit] = await Promise.all([
      database.collection("tenantProfiles").findOne({ tenantId, slug }),
      database.collection("stores").findOne({
        tenantId,
        code: "CLIFTON",
      }),
      database.collection("memberStoreAssignments").findOne({
        tenantId,
        membershipId: String(membership?._id),
      }),
      database.collection("auditLogs").findOne({
        tenantId,
        action: "tenant.onboarding.completed",
      }),
    ]);
    expect(profile).toMatchObject({
      businessName: "Rivera Atelier",
      planKey: "growth",
      billingStatus: "trialing",
      currency: "PKR",
      locale: "ur-PK",
    });
    expect(store).toMatchObject({ name: "Clifton Store", status: "active" });
    expect(assignment).toBeTruthy();
    expect(audit).toBeTruthy();
  });
});
