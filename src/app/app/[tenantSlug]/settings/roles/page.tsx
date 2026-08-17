import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CustomRoleManagement } from "@/components/settings/custom-role-management";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PageHeader } from "@/components/shared/page-header";
import { hasPermission } from "@/modules/permissions/permissions";
import { getCustomRoleWorkspace } from "@/server/repositories/custom-roles";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Roles and permissions" };

export default async function RolesSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (tenantSlug === "demo")
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
        <PageHeader
          eyebrow="Settings"
          title="Roles and permissions"
          description="Create least-privilege roles and apply them to tenant members."
        />
        <SettingsNav tenantSlug={tenantSlug} current="/settings/roles" />
        <CustomRoleManagement
          tenantSlug={tenantSlug}
          workspace={{
            enabled: false,
            planName: "Growth",
            roles: [],
            members: [],
          }}
          canManage={false}
          isDemo
        />
      </div>
    );
  const context = await requireTenantContext(tenantSlug).catch(() =>
    notFound(),
  );
  if (!hasPermission(context.permissions, "settings:read")) notFound();
  const workspace = await getCustomRoleWorkspace(context);
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Settings"
        title="Roles and permissions"
        description="Create least-privilege roles and apply them to tenant members."
      />
      <SettingsNav tenantSlug={tenantSlug} current="/settings/roles" />
      <CustomRoleManagement
        tenantSlug={tenantSlug}
        workspace={workspace}
        canManage={
          hasPermission(context.permissions, "settings:manage") &&
          hasPermission(context.permissions, "member:updateRole")
        }
        isDemo={false}
      />
    </div>
  );
}
