import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockAdjustmentDialog } from "@/components/inventory/inventory-actions";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import { PageContainer, PageStatus } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardList,
  CardListItem,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/config/env";
import {
  demoInventoryStores,
  demoInventoryVariants,
  demoStockAdjustments,
} from "@/modules/inventory/demo-data";
import type {
  InventoryVariantOption,
  StockAdjustmentItem,
} from "@/modules/inventory/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { InventoryRepository } from "@/server/repositories/inventory";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Stock adjustments" };

function reasonLabel(reason: string): string {
  return reason
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function recordDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function StockAdjustmentsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let records: StockAdjustmentItem[] = demoStockAdjustments;
  let stores = demoInventoryStores;
  let variants: InventoryVariantOption[] = demoInventoryVariants;
  let activeStoreId: string | null = stores[0]?.id ?? null;
  let isDemo = true;
  let canAdjust = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new InventoryRepository();
      [records, { stores, variants }] = await Promise.all([
        repository.adjustments(context),
        repository.options(context),
      ]);
      activeStoreId = context.activeStoreId;
      isDemo = false;
      canAdjust = hasPermission(context.permissions, "inventory:adjust");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <PageContainer>
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="Posted records are immutable and retained for audit history"
      />
      <PageHeader
        eyebrow="Inventory"
        parentHref={`/app/${tenantSlug}/inventory`}
        title="Stock adjustments"
        description="Correct counts, record damage or expiry, and document every manual stock change."
        actions={
          <StockAdjustmentDialog
            tenantSlug={tenantSlug}
            stores={stores}
            variants={variants}
            activeStoreId={activeStoreId}
            disabled={isDemo || !canAdjust}
          />
        }
      />
      <InventoryNav tenantSlug={tenantSlug} current="adjustments" />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="text-muted-foreground size-4" />
            <CardTitle>Adjustment history</CardTitle>
          </div>
          <CardDescription>
            Latest 100 posted adjustments across your assigned stores.
          </CardDescription>
        </CardHeader>
        {records.length === 0 ? (
          <CardContent className="text-muted-foreground text-sm">
            No stock adjustments have been posted yet.
          </CardContent>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Store</th>
                    <th className="px-4 py-3 font-medium">Reason</th>
                    <th className="px-4 py-3 text-right font-medium">Change</th>
                    <th className="px-4 py-3 text-right font-medium">
                      On hand
                    </th>
                    <th className="px-6 py-3 text-right font-medium">Posted</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-muted/25">
                      <td className="px-6 py-4">
                        <p className="font-medium">{record.productName}</p>
                        <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                          {record.sku} · {record.variantName}
                        </p>
                        <p
                          className="text-muted-foreground mt-1 max-w-sm truncate text-xs"
                          title={record.note}
                        >
                          {record.note}
                        </p>
                      </td>
                      <td className="px-4 py-4">{record.storeName}</td>
                      <td className="px-4 py-4">
                        <Badge variant="outline">
                          {reasonLabel(record.reason)}
                        </Badge>
                      </td>
                      <td
                        className={`px-4 py-4 text-right font-semibold tabular-nums ${record.quantityDelta >= 0 ? "text-success-foreground" : "text-destructive"}`}
                      >
                        {record.quantityDelta >= 0 ? "+" : ""}
                        {record.quantityDelta.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums">
                        {record.previousQuantity.toLocaleString()} →{" "}
                        {record.newQuantity.toLocaleString()}
                      </td>
                      <td className="text-muted-foreground px-6 py-4 text-right text-xs">
                        <time dateTime={record.createdAt}>
                          {recordDate(record.createdAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardList className="md:hidden">
              {records.map((record) => (
                <CardListItem key={record.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {record.productName}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                        {record.sku} · {record.storeName}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${record.quantityDelta >= 0 ? "text-success-foreground" : "text-destructive"}`}
                    >
                      {record.quantityDelta >= 0 ? "+" : ""}
                      {record.quantityDelta.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {reasonLabel(record.reason)}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {record.previousQuantity.toLocaleString()} →{" "}
                      {record.newQuantity.toLocaleString()} on hand
                    </span>
                  </div>
                  <p className="mt-3 text-sm">{record.note}</p>
                  <time
                    className="text-muted-foreground mt-1 block text-xs"
                    dateTime={record.createdAt}
                  >
                    {recordDate(record.createdAt)}
                  </time>
                </CardListItem>
              ))}
            </CardList>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
