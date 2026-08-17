import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsNav } from "@/components/purchasing/operations-nav";
import {
  NewSupplierDialog,
  SupplierManagement,
} from "@/components/purchasing/supplier-management";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import { demoSuppliers } from "@/modules/purchasing/demo-data";
import { supplierListQuerySchema } from "@/modules/purchasing/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { PurchasingRepository } from "@/server/repositories/purchasing";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = supplierListQuerySchema.parse(await searchParams);
  let filtered = demoSuppliers.filter(
    (supplier) => query.status === "all" || supplier.status === query.status,
  );
  if (query.q) {
    const q = query.q.toLowerCase();
    filtered = filtered.filter((supplier) =>
      [supplier.name, supplier.supplierCode, supplier.contactName].some(
        (value) => value.toLowerCase().includes(q),
      ),
    );
  }
  let result = { items: filtered, total: filtered.length };
  let isDemo = true;
  let denied = false;
  let canCreate = false;
  let canUpdate = false;
  if (tenantSlug !== "demo" && env.MONGODB_URI)
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "supplier:read")) denied = true;
      else {
        result = await new PurchasingRepository().suppliers(context, query);
        canCreate = hasPermission(context.permissions, "supplier:create");
        canUpdate = hasPermission(context.permissions, "supplier:update");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <OperationsNav tenantSlug={tenantSlug} current="/suppliers" />
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Supplier changes are snapshotted into orders
        </span>
      </div>
      <PageHeader
        eyebrow="Purchasing"
        title="Suppliers"
        description="Manage supplier contacts and purchasing terms while retaining historical purchase snapshots."
        actions={
          <NewSupplierDialog
            tenantSlug={tenantSlug}
            disabled={isDemo || denied || !canCreate}
          />
        }
      />
      {denied ? (
        <PermissionDenied />
      ) : (
        <Card>
          <CardContent className="border-b p-4">
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
              <input
                name="q"
                defaultValue={query.q}
                placeholder="Search suppliers…"
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={query.status}
                className="border-input bg-card min-h-10 rounded-lg border px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <button className="bg-primary text-primary-foreground rounded-lg px-4 text-sm font-medium">
                Apply
              </button>
            </form>
          </CardContent>
          <SupplierManagement
            tenantSlug={tenantSlug}
            items={result.items}
            canUpdate={canUpdate}
            isDemo={isDemo}
          />
        </Card>
      )}
    </div>
  );
}
