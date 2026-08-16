import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductAvailabilityDialog } from "@/components/inventory/inventory-settings";
import { InventoryNav } from "@/components/inventory/inventory-nav";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardList,
  CardListItem,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { env } from "@/config/env";
import {
  demoInventoryStores,
  demoProductAvailability,
} from "@/modules/inventory/demo-data";
import {
  productAvailabilityQuerySchema,
  type ProductAvailabilityItem,
} from "@/modules/inventory/schemas";
import { hasPermission } from "@/modules/permissions/permissions";
import { InventoryRepository } from "@/server/repositories/inventory";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Product availability" };

function statusBadge(status: ProductAvailabilityItem["status"]) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "draft") return <Badge variant="info">Draft</Badge>;
  return <Badge variant="secondary">Archived</Badge>;
}

export default async function ProductAvailabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenantSlug } = await params;
  const query = productAvailabilityQuerySchema.parse(await searchParams);
  let stores = demoInventoryStores;
  const matchingDemo = demoProductAvailability.filter((product) => {
    const term = query.q.toLowerCase();
    return (
      !term ||
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term)
    );
  });
  let result = {
    items: matchingDemo.slice(
      (query.page - 1) * query.pageSize,
      query.page * query.pageSize,
    ),
    total: matchingDemo.length,
  };
  let isDemo = true;
  let canManage = false;
  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      const data = await new InventoryRepository().availability(context, query);
      stores = data.stores;
      result = data.result;
      isDemo = false;
      canManage = hasPermission(context.permissions, "product:update");
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  const pageCount = Math.max(1, Math.ceil(result.total / query.pageSize));
  const currentPage = Math.min(query.page, pageCount);
  const pageHref = (page: number) => {
    const values = new URLSearchParams();
    if (query.q) values.set("q", query.q);
    values.set("page", String(page));
    values.set("pageSize", String(query.pageSize));
    return `/app/${tenantSlug}/inventory/availability?${values.toString()}`;
  };
  const storeById = new Map(stores.map((store) => [store.id, store]));
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          Product versions and store inventory are checked again when saving
        </span>
      </div>
      <PageHeader
        eyebrow="Inventory"
        parentHref={`/app/${tenantSlug}/inventory`}
        title="Product availability"
        description="Control which assigned stores can stock and sell each product without hiding inventory history."
      />
      <InventoryNav tenantSlug={tenantSlug} current="availability" />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="text-muted-foreground size-4" />
            <CardTitle>Store assignments</CardTitle>
          </div>
          <CardDescription>
            {result.total.toLocaleString()} catalog products match this view.
          </CardDescription>
        </CardHeader>
        <div className="border-b p-4 sm:px-6">
          <form className="flex flex-col gap-2 sm:flex-row" method="get">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search products or SKUs</span>
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                name="q"
                defaultValue={query.q}
                placeholder="Search products or SKUs"
                className="pl-9"
              />
            </label>
            <Button type="submit" variant="outline">
              Search
            </Button>
            {query.q && (
              <Button asChild type="button" variant="ghost">
                <Link href={`/app/${tenantSlug}/inventory/availability`}>
                  Clear
                </Link>
              </Button>
            )}
          </form>
        </div>
        {result.items.length === 0 ? (
          <CardContent className="text-muted-foreground text-sm">
            No products match this search.
          </CardContent>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
                  <tr>
                    <th className="px-6 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Available stores</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Assigned
                    </th>
                    <th className="px-6 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.items.map((product) => (
                    <tr key={product.productId} className="hover:bg-muted/25">
                      <td className="px-6 py-4">
                        <p className="font-medium">{product.name}</p>
                        <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                          {product.sku}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {statusBadge(product.status)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex max-w-md flex-wrap gap-1.5">
                          {product.availableStoreIds.map((storeId) => (
                            <Badge key={storeId} variant="outline">
                              {storeById.get(storeId)?.name ??
                                "Unavailable store"}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold tabular-nums">
                        {product.availableStoreIds.length} / {stores.length}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <ProductAvailabilityDialog
                          tenantSlug={tenantSlug}
                          product={product}
                          stores={stores}
                          disabled={
                            isDemo ||
                            !canManage ||
                            product.status === "archived"
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CardList className="md:hidden">
              {result.items.map((product) => (
                <CardListItem key={product.productId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {product.name}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                        {product.sku}
                      </p>
                    </div>
                    {statusBadge(product.status)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {product.availableStoreIds.map((storeId) => (
                      <Badge key={storeId} variant="outline">
                        {storeById.get(storeId)?.name ?? "Unavailable store"}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-xs">
                      {product.availableStoreIds.length} of {stores.length}{" "}
                      stores
                    </span>
                    <ProductAvailabilityDialog
                      tenantSlug={tenantSlug}
                      product={product}
                      stores={stores}
                      disabled={
                        isDemo || !canManage || product.status === "archived"
                      }
                    />
                  </div>
                </CardListItem>
              ))}
            </CardList>
          </>
        )}
        <div className="flex items-center justify-between gap-3 border-t p-4 sm:px-6">
          <p className="text-muted-foreground text-xs">
            Page {currentPage} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={pageHref(Math.max(1, currentPage - 1))}
                aria-disabled={currentPage <= 1}
                tabIndex={currentPage <= 1 ? -1 : undefined}
                className={
                  currentPage <= 1 ? "pointer-events-none opacity-50" : ""
                }
              >
                Previous
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link
                href={pageHref(Math.min(pageCount, currentPage + 1))}
                aria-disabled={currentPage >= pageCount}
                tabIndex={currentPage >= pageCount ? -1 : undefined}
                className={
                  currentPage >= pageCount
                    ? "pointer-events-none opacity-50"
                    : ""
                }
              >
                Next
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
