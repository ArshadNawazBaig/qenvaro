import { ArrowRight, ArrowRightLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StockTransferDialog } from "@/components/inventory/inventory-actions";
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
  demoStockTransfers,
} from "@/modules/inventory/demo-data";
import type {
  InventoryVariantOption,
  StockTransferItem,
} from "@/modules/inventory/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { InventoryRepository } from "@/server/repositories/inventory";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Stock transfers" };

function recordDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function StockTransfersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  let records: StockTransferItem[] = demoStockTransfers;
  let stores = demoInventoryStores;
  let variants: InventoryVariantOption[] = demoInventoryVariants;
  let activeStoreId: string | null = stores[0]?.id ?? null;
  let isDemo = true;
  let canTransfer = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const repository = new InventoryRepository();
      [records, { stores, variants }] = await Promise.all([
        repository.transfers(context),
        repository.options(context),
      ]);
      activeStoreId = context.activeStoreId;
      isDemo = false;
      canTransfer = hasPermission(context.permissions, "inventory:transfer");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  return (
    <PageContainer>
      <PageStatus
        tone={isDemo ? "demo" : "live"}
        label={isDemo ? "Demo data" : "Live tenant data"}
        detail="Transfers post source and destination stock atomically"
      />
      <PageHeader
        eyebrow="Inventory"
        parentHref={`/app/${tenantSlug}/inventory`}
        title="Stock transfers"
        description="Move one or more SKUs between assigned stores with a single traceable record."
        actions={
          <StockTransferDialog
            tenantSlug={tenantSlug}
            stores={stores}
            variants={variants}
            activeStoreId={activeStoreId}
            disabled={isDemo || !canTransfer}
          />
        }
      />
      <InventoryNav tenantSlug={tenantSlug} current="transfers" />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="text-muted-foreground size-4" />
            <CardTitle>Transfer history</CardTitle>
          </div>
          <CardDescription>
            Latest 100 completed transfers between stores you can access.
          </CardDescription>
        </CardHeader>
        {records.length === 0 ? (
          <CardContent className="text-muted-foreground text-sm">
            No stock transfers have been completed yet.
          </CardContent>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="px-6 py-3 font-medium">Transfer</th>
                    <th className="px-4 py-3 font-medium">Route</th>
                    <th className="px-4 py-3 text-right font-medium">Lines</th>
                    <th className="px-4 py-3 text-right font-medium">Units</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 text-right font-medium">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-muted/25">
                      <td className="px-6 py-4">
                        <p className="font-mono text-xs font-semibold">
                          {record.transferNumber}
                        </p>
                        <p
                          className="text-muted-foreground mt-1 max-w-xs truncate text-xs"
                          title={record.note}
                        >
                          {record.note}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span>{record.fromStoreName}</span>
                          <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
                          <span>{record.toStoreName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums">
                        {record.lineCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">
                        {record.unitCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="success">Completed</Badge>
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
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-xs font-semibold">
                      {record.transferNumber}
                    </p>
                    <Badge variant="success">Completed</Badge>
                  </div>
                  <div className="mt-3 flex min-w-0 items-center gap-2 text-sm font-medium">
                    <span className="truncate">{record.fromStoreName}</span>
                    <ArrowRight className="text-muted-foreground size-3.5 shrink-0" />
                    <span className="truncate">{record.toStoreName}</span>
                  </div>
                  <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span>
                      {record.lineCount}{" "}
                      {record.lineCount === 1 ? "line" : "lines"}
                    </span>
                    <span>{record.unitCount.toLocaleString()} units</span>
                    <time dateTime={record.createdAt}>
                      {recordDate(record.createdAt)}
                    </time>
                  </div>
                  <p className="mt-3 text-sm">{record.note}</p>
                </CardListItem>
              ))}
            </CardList>
          </>
        )}
      </Card>
    </PageContainer>
  );
}
