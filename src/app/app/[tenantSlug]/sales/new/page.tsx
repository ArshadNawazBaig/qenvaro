import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PosWorkspace } from "@/components/sales/pos-workspace";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import { hasPermission } from "@/modules/permissions/permissions";
import { getDemoSaleWorkspace } from "@/modules/sales/demo-data";
import { saleCatalogQuerySchema } from "@/modules/sales/schemas";
import { SaleRepository } from "@/server/repositories/sales";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "New sale" };

export default async function NewSalePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = saleCatalogQuerySchema.parse(await searchParams);
  let workspace = getDemoSaleWorkspace(query);
  let isDemo = true;
  let permissionDenied = false;
  let canComplete = false;

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "sale:create")) {
        permissionDenied = true;
      } else {
        workspace = await new SaleRepository().workspace(context, query);
        canComplete = hasPermission(context.permissions, "sale:complete");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }

  return (
    <PageContainer className="space-y-4 sm:space-y-5 lg:py-6 xl:py-7">
      <PageHeader
        eyebrow="Sales"
        title="New sale"
        description="Scan products, take payment, and issue a receipt from one checkout."
        actions={
          <PageStatus
            tone={isDemo ? "demo" : "live"}
            label={isDemo ? "Demo data" : "Live tenant data"}
            detail={
              workspace.store
                ? `${workspace.store.name} · ${workspace.store.code}`
                : "No active store selected"
            }
          />
        }
      />
      {permissionDenied ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ShoppingCart className="text-muted-foreground size-8" />
            <h2 className="mt-4 font-semibold">
              Point-of-sale access is restricted
            </h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              Your current role cannot create sales. Ask an owner or
              administrator to update your role.
            </p>
          </CardContent>
        </Card>
      ) : !workspace.store ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <ShoppingCart className="text-muted-foreground size-8" />
            <h2 className="mt-4 font-semibold">Choose an active store first</h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              A sale must belong to an assigned active store so inventory and
              receipt numbering remain accurate.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PosWorkspace
          tenantSlug={tenantSlug}
          workspace={workspace}
          query={query}
          disabled={isDemo || !canComplete}
        />
      )}
    </PageContainer>
  );
}
