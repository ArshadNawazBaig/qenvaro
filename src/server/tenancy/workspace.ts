import "server-only";
import { planKeySchema, plans } from "@/config/plans";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDatabase } from "@/server/db/client";
import type { TenantContext } from "./context";

export interface WorkspaceBusinessOption {
  tenantId: string;
  slug: string;
  name: string;
  planName: string;
}

export interface WorkspaceStoreOption {
  id: string;
  code: string;
  name: string;
}

export interface WorkspaceShellData {
  businessName: string;
  planName: string;
  storeName: string;
  userName: string;
  userEmail: string;
  productCount: number;
  productLimit: number | null;
  businesses: WorkspaceBusinessOption[];
  stores: WorkspaceStoreOption[];
  activeStoreId: string | null;
  canViewMembers: boolean;
  canViewBilling: boolean;
  canViewInventory: boolean;
  isDemo: boolean;
}

export async function getWorkspaceShellData(
  context: TenantContext,
): Promise<WorkspaceShellData> {
  const database = await getDatabase();
  const memberships = await database
    .collection<{ organizationId: string; userId: string }>("member")
    .find({ userId: context.userId }, { projection: { organizationId: 1 } })
    .limit(100)
    .toArray();
  const authorizedTenantIds = memberships.map(
    (membership) => membership.organizationId,
  );
  const [profile, stores, user, productCount, businessProfiles] =
    await Promise.all([
      database
        .collection<{
          tenantId: string;
          businessName: string;
          planKey: string;
        }>("tenantProfiles")
        .findOne(
          { tenantId: context.tenantId },
          { projection: { businessName: 1, planKey: 1 } },
        ),
      database
        .collection<{
          _id: string;
          tenantId: string;
          code: string;
          name: string;
        }>("stores")
        .find(
          {
            tenantId: context.tenantId,
            _id: { $in: [...context.allowedStoreIds] },
            status: "active",
            deletedAt: { $exists: false },
          },
          { projection: { code: 1, name: 1 } },
        )
        .sort({ name: 1, _id: 1 })
        .toArray(),
      database
        .collection<{ _id: string; name: string; email: string }>("user")
        .findOne(
          { _id: context.userId },
          { projection: { name: 1, email: 1 } },
        ),
      database.collection("products").countDocuments({
        tenantId: context.tenantId,
        deletedAt: { $exists: false },
      }),
      database
        .collection<{
          tenantId: string;
          slug: string;
          businessName: string;
          planKey: string;
        }>("tenantProfiles")
        .find(
          { tenantId: { $in: authorizedTenantIds } },
          { projection: { tenantId: 1, slug: 1, businessName: 1, planKey: 1 } },
        )
        .sort({ businessName: 1, tenantId: 1 })
        .toArray(),
    ]);
  if (!profile || !user)
    throw new Error("The workspace shell projection is incomplete.");
  const plan = plans[planKeySchema.parse(profile.planKey)];
  const businesses = businessProfiles.map((business) => ({
    tenantId: business.tenantId,
    slug: business.slug,
    name: business.businessName,
    planName: plans[planKeySchema.parse(business.planKey)].name,
  }));
  const activeStore = stores.find(
    (store) => String(store._id) === context.activeStoreId,
  );
  return {
    businessName: profile.businessName,
    planName: plan.name,
    storeName: activeStore?.name ?? "No assigned store",
    userName: user.name,
    userEmail: user.email,
    productCount,
    productLimit: plan.limits.products,
    businesses,
    stores: stores.map((store) => ({
      id: String(store._id),
      code: store.code,
      name: store.name,
    })),
    activeStoreId: context.activeStoreId,
    canViewMembers: hasPermission(context.permissions, "member:read"),
    canViewBilling: hasPermission(context.permissions, "billing:read"),
    canViewInventory: hasPermission(context.permissions, "inventory:read"),
    isDemo: false,
  };
}
