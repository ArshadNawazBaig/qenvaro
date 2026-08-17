import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NotificationCenter } from "@/components/governance/notification-center";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { demoTenantSettings } from "@/modules/settings/demo-data";
import { getNotifications } from "@/server/repositories/governance";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantSlug } = await params;
  const query = await searchParams;
  if (tenantSlug === "demo")
    return (
      <View
        tenantSlug={tenantSlug}
        data={{
          items: [
            {
              id: "demo-low",
              title: "Low stock requires attention",
              message: `${demoTenantSettings.businessName} has three products below their reorder level at Downtown.`,
              severity: "warning" as const,
              href: `/app/${tenantSlug}/inventory/alerts`,
              createdAt: new Date().toISOString(),
              read: true,
              source: "tenant" as const,
            },
          ],
          page: 1,
          pages: 1,
          unread: 0,
          total: 1,
        }}
      />
    );
  const context = await requireTenantContext(tenantSlug).catch(() =>
    notFound(),
  );
  const data = await getNotifications(context, query.page);
  return <View tenantSlug={tenantSlug} data={data} />;
}

function View({
  tenantSlug,
  data,
}: {
  tenantSlug: string;
  data: Awaited<ReturnType<typeof getNotifications>>;
}) {
  return (
    <PageContainer size="narrow">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Your tenant-scoped operational alerts and active platform announcements."
        actions={
          <Badge variant={data.unread ? "info" : "secondary"}>
            {data.unread} unread
          </Badge>
        }
      />
      <NotificationCenter tenantSlug={tenantSlug} items={data.items} />
      {data.pages > 1 && (
        <div className="flex justify-end gap-2 text-sm">
          {data.page > 1 && (
            <a
              className="rounded-lg border px-3 py-2"
              href={`?page=${data.page - 1}`}
            >
              Previous
            </a>
          )}
          <Badge variant="outline">
            Page {data.page} of {data.pages}
          </Badge>
          {data.page < data.pages && (
            <a
              className="rounded-lg border px-3 py-2"
              href={`?page=${data.page + 1}`}
            >
              Next
            </a>
          )}
        </div>
      )}
    </PageContainer>
  );
}
