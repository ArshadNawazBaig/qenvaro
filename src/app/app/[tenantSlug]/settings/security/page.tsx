import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SecurityDataSettings } from "@/components/settings/security-data-settings";
import { SettingsNav } from "@/components/settings/settings-nav";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { hasPermission } from "@/modules/permissions/permissions";
import { demoTenantSettings } from "@/modules/settings/demo-data";
import { getDatabase } from "@/server/db/client";
import { SettingsRepository } from "@/server/repositories/settings";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Security and data" };

export default async function SecuritySettingsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  if (tenantSlug === "demo")
    return (
      <SecurityPage
        tenantSlug={tenantSlug}
        settings={demoTenantSettings}
        twoFactorEnabled={false}
        canManage={false}
        canRequestDeletion={false}
        isDemo
      />
    );
  const context = await requireTenantContext(tenantSlug, {
    allowSuspended: true,
  }).catch(() => notFound());
  if (!hasPermission(context.permissions, "settings:read")) notFound();
  const database = await getDatabase();
  const [settings, user] = await Promise.all([
    new SettingsRepository().workspace(context),
    database
      .collection<{ _id: string; twoFactorEnabled?: boolean }>("user")
      .findOne(
        { _id: context.userId },
        { projection: { twoFactorEnabled: 1 } },
      ),
  ]);
  return (
    <SecurityPage
      tenantSlug={tenantSlug}
      settings={settings}
      twoFactorEnabled={user?.twoFactorEnabled === true}
      canManage={hasPermission(context.permissions, "settings:manage")}
      canRequestDeletion={hasPermission(context.permissions, "tenant:delete")}
      isDemo={false}
    />
  );
}

function SecurityPage({
  tenantSlug,
  settings,
  twoFactorEnabled,
  canManage,
  canRequestDeletion,
  isDemo,
}: {
  tenantSlug: string;
  settings: typeof demoTenantSettings;
  twoFactorEnabled: boolean;
  canManage: boolean;
  canRequestDeletion: boolean;
  isDemo: boolean;
}) {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Settings"
        title="Security, integrations and data"
        description="Protect your account, inspect provider readiness, and start controlled data workflows."
      />
      <SettingsNav tenantSlug={tenantSlug} current="/settings/security" />
      <SecurityDataSettings
        tenantSlug={tenantSlug}
        settings={settings}
        twoFactorEnabled={twoFactorEnabled}
        canManage={canManage}
        canRequestDeletion={canRequestDeletion}
        isDemo={isDemo}
      />
    </PageContainer>
  );
}
