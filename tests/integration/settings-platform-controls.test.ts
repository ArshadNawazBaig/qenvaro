import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolvePermissions } from "@/modules/permissions/permissions";
import { PlatformControlService } from "@/modules/platform/control-service";
import { CustomRoleService } from "@/modules/roles/service";
import { TenantSettingsService } from "@/modules/settings/service";
import type { VerifiedPlatformContext } from "@/server/auth/platform-context";
import type { TenantContext } from "@/server/tenancy/context";
import {
  canReadNotification,
  getAuditLog,
  getNotifications,
} from "@/server/repositories/governance";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";
type StringDocument = { _id: string } & Record<string, unknown>;

describe.skipIf(!enabled)(
  "tenant settings and platform control lifecycle",
  () => {
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const tenantId = `org_settings_${suffix}`;
    const otherTenantId = `org_settings_other_${suffix}`;
    const memberId = `member_settings_${suffix}`;
    const userId = `usr_settings_${suffix}`;
    const targetUserId = `usr_platform_target_${suffix}`;
    const storeOne = `store_settings_one_${suffix}`;
    const storeTwo = `store_settings_two_${suffix}`;
    const client = new MongoClient(process.env.MONGODB_URI!);
    let database: Db;
    let createdStoreId = "";
    let customRoleId = "";
    let supportGrantId = "";
    let announcementId = "";

    const context: TenantContext = {
      tenantId,
      tenantSlug: `settings-${suffix}`,
      userId,
      sessionId: `session_settings_${suffix}`,
      membershipId: memberId,
      roles: ["OWNER"],
      permissions: resolvePermissions(["OWNER"]),
      allowedStoreIds: new Set([storeOne, storeTwo]),
      activeStoreId: storeOne,
      requestId: `request_settings_${suffix}`,
    };
    const platformContext: VerifiedPlatformContext = {
      userId: `usr_platform_control_${suffix}`,
      sessionId: `session_platform_control_${suffix}`,
      name: "Platform Control",
      email: `platform-${suffix}@example.test`,
      role: "PLATFORM_SUPER_ADMIN",
      twoFactorEnabled: true,
      sessionAssured: true,
      access: "allow",
      requestId: `request_platform_control_${suffix}`,
    };

    beforeAll(async () => {
      await client.connect();
      database = client.db(process.env.MONGODB_DATABASE ?? "qenvaro");
      const now = new Date();
      await database.collection<StringDocument>("organization").insertOne({
        _id: tenantId,
        name: "Settings Integration",
        slug: context.tenantSlug,
        createdAt: now,
      });
      await database.collection<StringDocument>("tenantProfiles").insertMany([
        {
          _id: `profile_settings_${suffix}`,
          tenantId,
          slug: context.tenantSlug,
          businessName: "Settings Integration",
          legalName: "Private Legal Name",
          supportEmail: "private@example.test",
          locale: "en-PK",
          timezone: "Asia/Karachi",
          currency: "PKR",
          planKey: "business",
          billingStatus: "trialing",
          trialEndsAt: new Date(now.getTime() + 86_400_000),
          inventorySettings: { allowNegativeStock: false },
          operationSettings: {
            defaultTaxRateBps: 0,
            pricesIncludeTax: false,
            receiptPrefix: "SALE",
            returnPrefix: "RET",
            purchasePrefix: "PO",
            expensePrefix: "EXP",
            version: 1,
          },
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: `profile_settings_other_${suffix}`,
          tenantId: otherTenantId,
          slug: `settings-other-${suffix}`,
          businessName: "Other Settings",
          locale: "en-PK",
          timezone: "Asia/Karachi",
          currency: "PKR",
          planKey: "business",
          billingStatus: "active",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await database.collection<StringDocument>("stores").insertMany([
        {
          _id: storeOne,
          tenantId,
          name: "One",
          code: `A${suffix.slice(0, 6)}`,
          timezone: "Asia/Karachi",
          address: "",
          status: "active",
          version: 1,
          createdAt: now,
        },
        {
          _id: storeTwo,
          tenantId,
          name: "Two",
          code: `B${suffix.slice(0, 6)}`,
          timezone: "Asia/Karachi",
          address: "",
          status: "active",
          version: 1,
          createdAt: now,
        },
      ]);
      await database.collection<StringDocument>("products").insertOne({
        _id: `product_settings_${suffix}`,
        tenantId,
        currency: "PKR",
        createdAt: now,
        updatedAt: now,
      });
      await database.collection<StringDocument>("productVariants").insertOne({
        _id: `variant_settings_${suffix}`,
        tenantId,
        currency: "PKR",
        createdAt: now,
        updatedAt: now,
      });
      await database.collection<StringDocument>("member").insertOne({
        _id: memberId,
        organizationId: tenantId,
        userId,
        role: "manager",
        createdAt: now,
      });
      await database.collection<StringDocument>("user").insertOne({
        _id: targetUserId,
        name: "Platform Target",
        email: `target-${suffix}@example.test`,
        emailVerified: true,
        role: "user",
        createdAt: now,
        updatedAt: now,
      });
    });

    afterAll(async () => {
      for (const collection of [
        "auditLogs",
        "customRoleDefinitions",
        "memberCustomRoleAssignments",
        "memberStoreAssignments",
        "notificationReads",
        "notifications",
        "products",
        "productVariants",
        "sales",
        "stores",
        "tenantDataRequests",
        "usageCounters",
      ])
        await database
          .collection(collection)
          .deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
      await database
        .collection("member")
        .deleteMany({ organizationId: tenantId });
      await database
        .collection<StringDocument>("organization")
        .deleteMany({ _id: tenantId });
      await database.collection("supportAccessGrants").deleteMany({ tenantId });
      await database
        .collection("tenantFeatureFlagOverrides")
        .deleteMany({ tenantId });
      await database
        .collection("tenantProfiles")
        .deleteMany({ tenantId: { $in: [tenantId, otherTenantId] } });
      await database
        .collection("platformFeatureFlags")
        .deleteMany({ key: `integration_flag_${suffix}` });
      await database
        .collection<StringDocument>("platformAnnouncements")
        .deleteMany({ _id: announcementId });
      await database
        .collection("platformAuditLogs")
        .deleteMany({ actorId: platformContext.userId });
      await database
        .collection<StringDocument>("user")
        .deleteMany({ _id: targetUserId });
      await database.collection("session").deleteMany({ userId: targetUserId });
      await client.close();
    });

    it("updates settings, maintains atomic store usage, and queues controlled data requests", async () => {
      const service = new TenantSettingsService();
      await service.updateBusiness(context, {
        businessName: "Updated Settings Integration",
        legalName: "Confidential Legal Entity",
        supportEmail: "private-new@example.test",
        phone: "+92 300 000 0000",
        address: "Private business address",
        locale: "en-PK",
        timezone: "Asia/Karachi",
        currency: "AED",
        expectedVersion: 1,
      });
      await service.updateOperations(context, {
        defaultTaxRateBps: 1_800,
        pricesIncludeTax: true,
        receiptPrefix: "INV",
        returnPrefix: "RET",
        purchasePrefix: "PO",
        expensePrefix: "EXP",
        allowNegativeStock: false,
        expectedVersion: 1,
      });
      const created = await service.createStore(context, {
        name: "Three",
        code: `C${suffix.slice(0, 6)}`,
        timezone: "Asia/Karachi",
        address: "",
      });
      createdStoreId = created.id;
      await service.archiveStore(context, {
        storeId: createdStoreId,
        expectedVersion: 1,
      });
      await service.requestDataOperation(context, {
        type: "export",
        confirmation: "REQUEST EXPORT",
      });
      const [profile, product, variant, counter, store, assignment, request] =
        await Promise.all([
          database.collection("tenantProfiles").findOne({ tenantId }),
          database.collection("products").findOne({ tenantId }),
          database.collection("productVariants").findOne({ tenantId }),
          database
            .collection<StringDocument>("usageCounters")
            .findOne({ _id: `${tenantId}:stores` }),
          database
            .collection<StringDocument>("stores")
            .findOne({ _id: createdStoreId, tenantId }),
          database.collection("memberStoreAssignments").findOne({
            tenantId,
            membershipId: context.membershipId,
            storeId: createdStoreId,
          }),
          database
            .collection("tenantDataRequests")
            .findOne({ tenantId, type: "export" }),
        ]);
      expect(profile).toMatchObject({
        businessName: "Updated Settings Integration",
        currency: "AED",
        version: 2,
        operationSettings: {
          defaultTaxRateBps: 1_800,
          pricesIncludeTax: true,
          version: 2,
        },
      });
      expect(product).toMatchObject({ currency: "AED" });
      expect(variant).toMatchObject({ currency: "AED" });
      expect(counter).toMatchObject({ value: 2 });
      expect(store).toMatchObject({ status: "archived", version: 2 });
      expect(assignment).toBeTruthy();
      expect(request).toMatchObject({ status: "requested" });
      const auditText = JSON.stringify(
        await database.collection("auditLogs").find({ tenantId }).toArray(),
      );
      for (const secret of [
        "Private business address",
        "private-new@example.test",
        "+92 300 000 0000",
        "Confidential Legal Entity",
      ])
        expect(auditText).not.toContain(secret);
    });

    it("prevents an existing financial history from being relabeled", async () => {
      const saleId = `sale_settings_${suffix}`;
      await database.collection<StringDocument>("sales").insertOne({
        _id: saleId,
        tenantId,
        currency: "AED",
        totalMinor: 10_000,
        completedAt: new Date(),
      });
      const service = new TenantSettingsService();
      await expect(
        service.updateBusiness(context, {
          businessName: "Updated Settings Integration",
          legalName: "Confidential Legal Entity",
          supportEmail: "private-new@example.test",
          phone: "+92 300 000 0000",
          address: "Private business address",
          locale: "en-PK",
          timezone: "Asia/Karachi",
          currency: "USD",
          expectedVersion: 2,
        }),
      ).rejects.toThrow("controlled currency migration");
      expect(
        await database.collection("tenantProfiles").findOne({ tenantId }),
      ).toMatchObject({ currency: "AED", version: 2 });
      await database
        .collection<StringDocument>("sales")
        .deleteOne({ _id: saleId, tenantId });
    });

    it("creates and assigns a plan-gated custom role without protected capabilities", async () => {
      const service = new CustomRoleService();
      const created = await service.create(context, {
        name: "Receiving lead",
        description: "Receives approved inventory.",
        permissions: ["purchase:read", "purchase:receive", "inventory:read"],
      });
      customRoleId = created.id;
      await service.assign(context, { memberId, roleIds: [customRoleId] });
      const [role, assignment] = await Promise.all([
        database
          .collection<StringDocument>("customRoleDefinitions")
          .findOne({ _id: customRoleId, tenantId }),
        database
          .collection("memberCustomRoleAssignments")
          .findOne({ tenantId, membershipId: memberId, roleId: customRoleId }),
      ]);
      expect(role).toMatchObject({
        status: "active",
        permissions: ["purchase:read", "purchase:receive", "inventory:read"],
      });
      expect(assignment).toBeTruthy();
    });

    it("suspends and reactivates tenants and manages revocable support access", async () => {
      const service = new PlatformControlService();
      await service.suspendTenant(platformContext, {
        tenantId,
        expectedVersion: 2,
        reason: "Integration security review required.",
      });
      expect(
        await database.collection("tenantProfiles").findOne({ tenantId }),
      ).toMatchObject({
        billingStatus: "suspended",
        preSuspensionBillingStatus: "trialing",
        version: 3,
      });
      const grant = await service.grantSupportAccess(platformContext, {
        tenantId,
        reason: "Investigate an explicitly reported integration issue.",
        durationMinutes: 15,
      });
      supportGrantId = grant.id;
      await service.revokeSupportAccess(platformContext, {
        grantId: supportGrantId,
        reason: "Investigation completed and access is no longer required.",
      });
      await service.reactivateTenant(platformContext, {
        tenantId,
        expectedVersion: 3,
        reason: "Security review completed successfully.",
      });
      expect(
        await database.collection("tenantProfiles").findOne({ tenantId }),
      ).toMatchObject({ billingStatus: "trialing", version: 4 });
      expect(
        await database
          .collection<StringDocument>("supportAccessGrants")
          .findOne({ _id: supportGrantId }),
      ).toMatchObject({ status: "revoked" });
      expect(
        await database
          .collection("platformAuditLogs")
          .countDocuments({ actorId: platformContext.userId }),
      ).toBeGreaterThanOrEqual(4);
    });

    it("publishes audited release flags and tenant-visible announcements", async () => {
      const service = new PlatformControlService();
      const flag = await service.createFeatureFlag(platformContext, {
        key: `integration_flag_${suffix}`,
        description: "Integration-scoped controlled release flag.",
        defaultEnabled: false,
      });

      await service.setTenantFlagOverride(platformContext, {
        flagId: flag.id,
        tenantId,
        enabled: true,
      });
      const announcement = await service.publishAnnouncement(platformContext, {
        title: "Integration announcement",
        message:
          "A bounded integration announcement for tenant notification tests.",
        severity: "info",
        href: "/pricing",
        durationDays: 2,
      });
      announcementId = announcement.id;
      expect(
        await database
          .collection("tenantFeatureFlagOverrides")
          .findOne({ flagId: flag.id, tenantId }),
      ).toMatchObject({ enabled: true });
      expect(
        await database
          .collection<StringDocument>("platformAnnouncements")
          .findOne({ _id: announcementId }),
      ).toMatchObject({ status: "published" });
    });

    it("suspends platform identities, revokes sessions, and reactivates them", async () => {
      const service = new PlatformControlService();
      await database.collection<StringDocument>("session").insertOne({
        _id: `session_target_${suffix}`,
        userId: targetUserId,
        token: `token_target_${suffix}`,
        expiresAt: new Date(Date.now() + 86_400_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await service.banUser(platformContext, {
        userId: targetUserId,
        reason: "Repeated verified abuse during integration testing.",
        durationDays: 7,
      });
      expect(
        await database
          .collection<StringDocument>("user")
          .findOne({ _id: targetUserId }),
      ).toMatchObject({ banned: true });
      expect(
        await database
          .collection("session")
          .countDocuments({ userId: targetUserId }),
      ).toBe(0);
      await service.unbanUser(platformContext, {
        userId: targetUserId,
        reason: "Identity review completed and access was approved.",
      });
      expect(
        await database
          .collection<StringDocument>("user")
          .findOne({ _id: targetUserId }),
      ).toMatchObject({ banned: false });
    });

    it("has migration-backed settings and platform-control indexes", async () => {
      expect(
        (await database.collection("customRoleDefinitions").indexes()).map(
          (index) => index.name,
        ),
      ).toContain("tenant_custom_role_name_active_unique");
      expect(
        (await database.collection("supportAccessGrants").indexes()).map(
          (index) => index.name,
        ),
      ).toContain("tenant_support_access_status");
      expect(
        (await database.collection("tenantFeatureFlagOverrides").indexes()).map(
          (index) => index.name,
        ),
      ).toContain("platform_flag_tenant_override_unique");
    });

    it("keeps notification and advanced-audit reads tenant scoped", async () => {
      const now = new Date();
      const ownNotificationId = `notification_own_${suffix}`;
      const otherNotificationId = `notification_other_${suffix}`;
      await database.collection<StringDocument>("notifications").insertMany([
        {
          _id: ownNotificationId,
          tenantId,
          audience: "all",
          title: "Scoped notification",
          message: "Visible to this tenant only.",
          severity: "info",
          createdAt: now,
        },
        {
          _id: otherNotificationId,
          tenantId: otherTenantId,
          audience: "all",
          title: "Other notification",
          message: "Must stay isolated.",
          severity: "critical",
          createdAt: now,
        },
      ]);
      await database.collection<StringDocument>("auditLogs").insertOne({
        _id: `audit_other_${suffix}`,
        tenantId: otherTenantId,
        actorId: userId,
        action: "other.secret",
        entityType: "other",
        entityId: "other",
        requestId: "other-request",
        summary: "Must stay isolated.",
        createdAt: now,
      });
      const notifications = await getNotifications(context, 1);
      expect(notifications.items.map((item) => item.id)).toContain(
        ownNotificationId,
      );
      expect(notifications.items.map((item) => item.id)).not.toContain(
        otherNotificationId,
      );
      await expect(
        canReadNotification(context, otherNotificationId),
      ).resolves.toBe(false);
      const audit = await getAuditLog(context, { page: 1 });
      expect(audit.enabled).toBe(true);
      expect(audit.items.map((item) => item.action)).not.toContain(
        "other.secret",
      );
    });
  },
);
