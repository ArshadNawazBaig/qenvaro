import { AppShell } from "@/components/layout/app-shell";
import { RealtimeNotificationProvider } from "@/components/realtime/realtime-notification-provider";
import { notFound } from "next/navigation";
import { env } from "@/config/env";
import { requireTenantContext } from "@/server/tenancy/resolve-context";
import { getWorkspaceShellData } from "@/server/tenancy/workspace";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let workspace;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug, {
        allowSuspended: true,
      });
      workspace = await getWorkspaceShellData(context);
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <RealtimeNotificationProvider
      key={tenantSlug}
      tenantSlug={tenantSlug}
      enabled={Boolean(workspace && !workspace.isDemo)}
    >
      <AppShell tenantSlug={tenantSlug} workspace={workspace}>
        {children}
      </AppShell>
    </RealtimeNotificationProvider>
  );
}
