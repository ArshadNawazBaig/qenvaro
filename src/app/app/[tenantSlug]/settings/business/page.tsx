import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessSettings } from "@/components/settings/business-settings";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { hasPermission } from "@/modules/permissions/permissions";
import { demoTenantSettings } from "@/modules/settings/demo-data";
import { SettingsRepository } from "@/server/repositories/settings";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Business settings" };

export default async function BusinessSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (tenantSlug === "demo")
    return (
      <SettingsPage
        tenantSlug={tenantSlug}
        settings={demoTenantSettings}
        canManage={false}
        isDemo
      />
    );
  const context = await requireTenantContext(tenantSlug).catch(() =>
    notFound(),
  );
  if (!hasPermission(context.permissions, "settings:read")) notFound();
  const settings = await new SettingsRepository().workspace(context);
  return (
    <SettingsPage
      tenantSlug={tenantSlug}
      settings={settings}
      canManage={hasPermission(context.permissions, "settings:manage")}
      isDemo={false}
    />
  );
}

function SettingsPage({
  tenantSlug,
  settings,
  canManage,
  isDemo,
}: {
  tenantSlug: string;
  settings: typeof demoTenantSettings;
  canManage: boolean;
  isDemo: boolean;
}) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Settings"
        title="Business profile"
        description="Manage your organization identity, regional defaults, tax behavior, numbering, and inventory policy."
      />
      <SettingsNav tenantSlug={tenantSlug} current="/settings/business" />
      {!canManage && (
        <div className="bg-muted text-muted-foreground rounded-xl border p-4 text-sm">
          These settings are read-only for your current role.
        </div>
      )}
      <BusinessSettings
        tenantSlug={tenantSlug}
        settings={settings}
        canManage={canManage}
        isDemo={isDemo}
      />
    </PageContainer>
  );
}
