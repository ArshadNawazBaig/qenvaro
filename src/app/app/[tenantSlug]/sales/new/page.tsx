import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PosWorkspace } from "@/components/sales/pos-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
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
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {workspace.store
            ? `${workspace.store.name} · ${workspace.store.code}`
            : "No active store selected"}
        </span>
      </div>
      <PageHeader
        eyebrow="Sales"
        title="New sale"
        description="Build a checkout, record how the customer paid, and complete stock and receipt records together."
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
    </div>
  );
}
