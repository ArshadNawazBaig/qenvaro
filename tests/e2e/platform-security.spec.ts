import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { MongoClient, type Db } from "mongodb";
import { bootstrapConfiguredSuperAdmins } from "../../scripts/platform/bootstrap-service";

if (existsSync(".env.local")) loadEnvFile(".env.local");

const enabled = process.env.RUN_PLATFORM_E2E === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 TOTP secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function freshTotp(page: Page, secret: string): Promise<string> {
  const elapsed = Date.now() % 30_000;
  if (elapsed > 27_000) await page.waitForTimeout(30_500 - elapsed);
  return totp(secret);
}

test.describe("platform super-admin security", () => {
  test.skip(
    !enabled,
    "Set RUN_PLATFORM_E2E=true with the local replica set running.",
  );

  let client: MongoClient;
  let database: Db;
  let email = "";

  test.beforeAll(async () => {
    client = new MongoClient(process.env.MONGODB_URI!);
    await client.connect();
    database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
    await database.collection("rateLimit").deleteMany({
      key: { $regex: /\|\/(?:sign-up|sign-in\/email|two-factor)/ },
    });
  });

  test.afterEach(async () => {
    if (!email) return;
    const user = await database
      .collection<StringDocument>("user")
      .findOne({ email });
    if (!user) return;
    const userId = String(user._id);
    await database
      .collection("platformSessionAssurances")
      .deleteMany({ userId });
    await database.collection("platformAuditLogs").deleteMany({
      entityId: userId,
    });
    await database.collection("twoFactor").deleteMany({ userId });
    await database.collection("session").deleteMany({ userId });
    await database.collection("account").deleteMany({ userId });
    await database.collection("verification").deleteMany({
      $or: [{ identifier: email }, { value: userId }],
    });
    await database.collection<StringDocument>("user").deleteOne({
      _id: userId,
    });
    email = "";
  });

  test.afterAll(async () => {
    await client.close();
  });

  test("enrolls TOTP, rejects an unassured session, and verifies platform access", async ({
    page,
  }, testInfo) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const project = testInfo.project.name
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase();
    email = `platform-${project}-${suffix}@example.test`;
    const password = `Qenvaro-platform-${suffix}!2026`;

    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Morgan Platform");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("status")).toContainText("Check your inbox");
    await expect
      .poll(async () =>
        database.collection<StringDocument>("user").findOne({ email }),
      )
      .not.toBeNull();
    await database
      .collection<StringDocument>("user")
      .updateOne(
        { email },
        { $set: { emailVerified: true, updatedAt: new Date() } },
      );
    await bootstrapConfiguredSuperAdmins(database, [email]);

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    await page.goto("/platform");
    await expect(page).toHaveURL(/\/platform\/security$/);
    await expect(
      page.getByRole("heading", { name: "Two-factor security" }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.getByLabel("Confirm your password").fill(password);
    await page.getByRole("button", { name: "Start secure enrollment" }).click();
    const secret = (await page
      .getByTestId("totp-secret")
      .textContent())!.trim();
    expect(secret).not.toBe("");
    await page.getByRole("checkbox").click();
    await page
      .getByLabel("Six-digit authenticator code")
      .fill(await freshTotp(page, secret));
    await page
      .getByRole("button", { name: "Verify and unlock platform" })
      .click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(
      page.getByRole("heading", { name: "Service overview" }),
    ).toBeVisible();
    await expect(page.getByText("Verified platform session")).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    const user = await database
      .collection<StringDocument>("user")
      .findOne({ email });
    await database.collection("platformSessionAssurances").deleteMany({
      userId: String(user?._id),
    });
    await page.reload();
    await expect(page).toHaveURL(/\/platform\/security$/);
    await page
      .getByLabel("Authenticator code")
      .fill(await freshTotp(page, secret));
    await page.getByRole("button", { name: "Verify platform session" }).click();
    await expect(page).toHaveURL(/\/platform$/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/two-factor$/);
    await page
      .getByLabel("Authenticator code")
      .fill(await freshTotp(page, secret));
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await expect(page).toHaveURL(/\/platform$/);
    await expect(
      page.getByRole("heading", { name: "Service overview" }),
    ).toBeVisible();
  });
});
