import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OperationsNav } from "@/components/purchasing/operations-nav";
import {
  NewPurchaseDialog,
  PurchaseManagement,
} from "@/components/purchasing/purchase-management";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PermissionDenied } from "@/components/shared/states";
import { Card } from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoPurchaseOrders,
  demoPurchasingReference,
} from "@/modules/purchasing/demo-data";
import type {
  PurchaseOrderListItem,
  PurchasingReferenceData,
} from "@/modules/purchasing/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { PurchasingRepository } from "@/server/repositories/purchasing";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Purchases" };

export default async function PurchasesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let orders: PurchaseOrderListItem[] = demoPurchaseOrders;
  let reference: PurchasingReferenceData = demoPurchasingReference;
  let isDemo = true;
  let denied = false;
  let permissions = {
    canCreate: false,
    canApprove: false,
    canReceive: false,
    canCancel: false,
  };
  if (tenantSlug !== "demo" && env.MONGODB_URI)
    try {
      const context = await requireTenantContext(tenantSlug);
      isDemo = false;
      if (!hasPermission(context.permissions, "purchase:read")) denied = true;
      else {
        const repository = new PurchasingRepository();
        [orders, reference] = await Promise.all([
          repository.purchaseOrders(context),
          repository.referenceData(context),
        ]);
        permissions = {
          canCreate: hasPermission(context.permissions, "purchase:create"),
          canApprove: hasPermission(context.permissions, "purchase:approve"),
          canReceive: hasPermission(context.permissions, "purchase:receive"),
          canCancel: hasPermission(context.permissions, "purchase:cancel"),
        };
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  return (
    <PageContainer>
      <OperationsNav tenantSlug={tenantSlug} current="/purchases" />
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="Receiving writes the inventory ledger atomically"
      />
      <PageHeader
        eyebrow="Purchasing"
        title="Purchase orders"
        description="Draft, approve, receive, and retain supplier orders with immutable item and cost snapshots."
        actions={
          <NewPurchaseDialog
            tenantSlug={tenantSlug}
            reference={reference}
            disabled={
              isDemo ||
              denied ||
              !permissions.canCreate ||
              reference.suppliers.length === 0 ||
              reference.variants.length === 0
            }
          />
        }
      />
      {denied ? (
        <PermissionDenied />
      ) : (
        <Card>
          <PurchaseManagement
            tenantSlug={tenantSlug}
            orders={orders}
            permissions={permissions}
            isDemo={isDemo}
          />
        </Card>
      )}
    </PageContainer>
  );
}
