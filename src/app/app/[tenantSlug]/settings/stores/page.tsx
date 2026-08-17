import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsNav } from "@/components/settings/settings-nav";
import {
  NewStoreDialog,
  StoreManagement,
} from "@/components/settings/store-management";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { hasPermission } from "@/modules/permissions/permissions";
import { demoTenantSettings } from "@/modules/settings/demo-data";
import { SettingsRepository } from "@/server/repositories/settings";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Store settings" };

export default async function StoresSettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (tenantSlug === "demo")
    return (
      <StoresPage
        tenantSlug={tenantSlug}
        settings={demoTenantSettings}
        canManage={false}
        isDemo
      />
    );
  const context = await requireTenantContext(tenantSlug).catch(() =>
    notFound(),
  );
  if (!hasPermission(context.permissions, "store:read")) notFound();
  const settings = await new SettingsRepository().workspace(context);
  return (
    <StoresPage
      tenantSlug={tenantSlug}
      settings={settings}
      canManage={
        hasPermission(context.permissions, "store:create") &&
        hasPermission(context.permissions, "store:update")
      }
      isDemo={false}
    />
  );
}

function StoresPage({
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
  const active = settings.stores.filter(
    (store) => store.status === "active",
  ).length;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Settings"
        title="Stores"
        description="Manage operating locations, timezone boundaries, and subscription capacity."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {active}
              {settings.storeLimit === null
                ? " active"
                : ` / ${settings.storeLimit} active`}
            </Badge>
            <NewStoreDialog
              tenantSlug={tenantSlug}
              defaultTimezone={settings.timezone}
              disabled={isDemo || !canManage}
            />
          </div>
        }
      />
      <SettingsNav tenantSlug={tenantSlug} current="/settings/stores" />
      <StoreManagement
        tenantSlug={tenantSlug}
        stores={settings.stores}
        defaultTimezone={settings.timezone}
        canManage={canManage}
        isDemo={isDemo}
      />
    </PageContainer>
  );
}
