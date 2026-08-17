import "server-only";
import { planKeySchema, plans } from "@/config/plans";
import { env } from "@/config/env";
import { requirePermission } from "@/modules/permissions/permissions";
import type { TenantSettingsProjection } from "@/modules/settings/schemas";
import { getDatabase } from "@/server/db/client";
import { isCloudinaryConfigured } from "@/server/media/cloudinary";
import type { TenantContext } from "@/server/tenancy/context";

export class SettingsRepository {
  async workspace(context: TenantContext): Promise<TenantSettingsProjection> {
    requirePermission(context.permissions, "settings:read");
    const database = await getDatabase();
    const [profile, stores, requests] = await Promise.all([
      database
        .collection<{
          businessName: string;
          businessLogo?: {
            publicId: string;
            assetId: string;
            secureUrl: string;
            width: number;
            height: number;
            format: string;
            bytes: number;
          };
          legalName?: string;
          supportEmail?: string;
          phone?: string;
          address?: string;
          locale: string;
          timezone: string;
          currency: string;
          planKey: string;
          version?: number;
          inventorySettings?: { allowNegativeStock?: boolean };
          operationSettings?: {
            defaultTaxRateBps?: number;
            pricesIncludeTax?: boolean;
            receiptPrefix?: string;
            returnPrefix?: string;
            purchasePrefix?: string;
            expensePrefix?: string;
            version?: number;
          };
        }>("tenantProfiles")
        .findOne({ tenantId: context.tenantId }),
      database
        .collection<{
          _id: string;
          name: string;
          code: string;
          timezone?: string;
          address?: string;
          status: "active" | "archived";
          version?: number;
          createdAt: Date;
        }>("stores")
        .find({ tenantId: context.tenantId }, { projection: { tenantId: 0 } })
        .sort({ status: 1, name: 1, _id: 1 })
        .limit(100)
        .toArray(),
      database
        .collection<{
          _id: string;
          type: "export" | "deletion";
          status: string;
          requestedAt: Date;
        }>("tenantDataRequests")
        .find(
          {
            tenantId: context.tenantId,
            status: { $in: ["requested", "reviewing"] },
          },
          { projection: { type: 1, status: 1, requestedAt: 1 } },
        )
        .sort({ requestedAt: -1 })
        .limit(10)
        .toArray(),
    ]);
    if (!profile) throw new Error("Tenant settings are unavailable.");
    const plan = plans[planKeySchema.parse(profile.planKey)];
    return {
      businessName: profile.businessName,
      businessLogo: profile.businessLogo ?? null,
      legalName: profile.legalName ?? "",
      supportEmail: profile.supportEmail ?? "",
      phone: profile.phone ?? "",
      address: profile.address ?? "",
      locale: profile.locale,
      timezone: profile.timezone,
      currency: profile.currency,
      planKey: plan.key,
      version: profile.version ?? 1,
      operationSettings: {
        defaultTaxRateBps: profile.operationSettings?.defaultTaxRateBps ?? 0,
        pricesIncludeTax: profile.operationSettings?.pricesIncludeTax === true,
        receiptPrefix: profile.operationSettings?.receiptPrefix ?? "SALE",
        returnPrefix: profile.operationSettings?.returnPrefix ?? "RET",
        purchasePrefix: profile.operationSettings?.purchasePrefix ?? "PO",
        expensePrefix: profile.operationSettings?.expensePrefix ?? "EXP",
        allowNegativeStock:
          profile.inventorySettings?.allowNegativeStock === true,
        version: profile.operationSettings?.version ?? 1,
      },
      integrations: {
        googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
        cloudinary: isCloudinaryConfigured(),
        email: env.EMAIL_PROVIDER !== "log" || env.NODE_ENV !== "production",
      },
      stores: stores.map((store) => ({
        id: store._id,
        name: store.name,
        code: store.code,
        timezone: store.timezone ?? profile.timezone,
        address: store.address ?? "",
        status: store.status,
        version: store.version ?? 1,
        createdAt: store.createdAt.toISOString(),
      })),
      storeLimit: plan.limits.stores,
      pendingDataRequests: requests.map((request) => ({
        id: request._id,
        type: request.type,
        status: request.status,
        requestedAt: request.requestedAt.toISOString(),
      })),
    };
  }
}
