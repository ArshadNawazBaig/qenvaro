import { RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { ReturnWorkspace } from "@/components/sales/return-workspace";
import { Card, CardContent } from "@/components/ui/card";
import { env } from "@/config/env";
import { hasPermission } from "@/modules/permissions/permissions";
import { receiptIdSchema } from "@/modules/sales/schemas";
import { SaleReturnRepository } from "@/server/repositories/sale-returns";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Return sale items" };

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; saleId: string }>;
}) {
  if (!env.MONGODB_URI) notFound();
  const { tenantSlug, saleId: untrustedSaleId } = await params;
  const parsed = receiptIdSchema.safeParse(untrustedSaleId);
  if (!parsed.success) notFound();
  let workspace = null;
  let permissionDenied = false;
  let activeStoreMatches = false;
  try {
    const context = await requireTenantContext(tenantSlug);
    if (!hasPermission(context.permissions, "sale:refund")) {
      permissionDenied = true;
    } else {
      workspace = await new SaleReturnRepository().workspace(
        context,
        parsed.data,
      );
      activeStoreMatches = context.activeStoreId === workspace?.store.id;
    }
  } catch {
    notFound();
  }
  if (!permissionDenied && !workspace) notFound();

  return (
    <PageContainer>
      <PageStatus
        tone="demo"
        label="Controlled return"
        detail="Refund amounts are derived from the original completed receipt"
      />
      <PageHeader
        eyebrow="Receipt"
        parentHref={`/app/${tenantSlug}/sales/${parsed.data}`}
        title="Return sale items"
        description="Choose only the units received back. Inventory restoration, refund evidence, and the return receipt complete together."
      />
      {permissionDenied ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <RotateCcw className="text-muted-foreground size-8" />
            <h2 className="mt-4 font-semibold">Returns are restricted</h2>
            <p className="text-muted-foreground mt-1 max-w-md text-sm leading-6">
              Your current role cannot complete returns or record refunds. Ask
              an owner or administrator to update your role.
            </p>
          </CardContent>
        </Card>
      ) : (
        workspace && (
          <ReturnWorkspace
            tenantSlug={tenantSlug}
            workspace={workspace}
            activeStoreMatches={activeStoreMatches}
          />
        )
      )}
    </PageContainer>
  );
}
