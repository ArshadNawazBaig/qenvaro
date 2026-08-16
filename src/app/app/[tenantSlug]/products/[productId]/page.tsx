import {
  Archive,
  Boxes,
  CalendarClock,
  Eye,
  PackageCheck,
  Store,
  Tag,
  Tags as TagsIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductDetailConsole } from "@/components/products/product-detail-console";
import { PageHeader } from "@/components/shared/page-header";
import { TagBadge } from "@/components/tags/tag-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/config/env";
import { formatMoney } from "@/lib/money";
import { hasPermission } from "@/modules/permissions/permissions";
import {
  demoProducts,
  getDemoProductDetail,
} from "@/modules/products/demo-data";
import type { ProductDetail } from "@/modules/products/schemas";
import { getDemoTagOptions } from "@/modules/tags/demo-data";
import { CategoryRepository } from "@/server/repositories/categories";
import { ProductRepository } from "@/server/repositories/products";
import { TagRepository } from "@/server/repositories/tags";
import { requireTenantContext } from "@/server/tenancy/resolve-context";

export const metadata: Metadata = { title: "Product details" };

function ProductStatusBadge({ status }: { status: ProductDetail["status"] }) {
  return (
    <Badge
      variant={
        status === "active"
          ? "success"
          : status === "draft"
            ? "info"
            : "secondary"
      }
      className="capitalize"
    >
      {status}
    </Badge>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; productId: string }>;
}) {
  const { tenantSlug, productId } = await params;
  let product = getDemoProductDetail(productId);
  let isDemo = true;
  let canUpdate = false;
  let canArchive = false;
  let resolvedLiveTenant = false;
  let categoryNames = [
    ...new Set(demoProducts.map((demoProduct) => demoProduct.category)),
  ].sort();
  let tagOptions = getDemoTagOptions();

  if (env.MONGODB_URI) {
    try {
      const context = await requireTenantContext(tenantSlug);
      resolvedLiveTenant = true;
      [product, categoryNames, tagOptions] = await Promise.all([
        new ProductRepository().detail(context, productId),
        new CategoryRepository().activeNames(context),
        new TagRepository().activeOptions(context),
      ]);
      if (product) {
        isDemo = false;
        canUpdate = hasPermission(context.permissions, "product:update");
        canArchive = hasPermission(context.permissions, "product:archive");
      }
    } catch {
      if (env.NODE_ENV === "production") notFound();
    }
  }
  if (!product || (resolvedLiveTenant && isDemo)) notFound();

  const productsHref = `/app/${tenantSlug}/products`;
  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2">
        <Badge variant={isDemo ? "warning" : "success"}>
          {isDemo ? "Demo data" : "Live tenant data"}
        </Badge>
        <span className="text-muted-foreground text-xs">
          {isDemo
            ? "Read-only preview"
            : "Tenant ownership and store access verified server-side"}
        </span>
      </div>
      <PageHeader
        eyebrow="Products"
        parentHref={productsHref}
        title={product.name}
        description={`${product.subtitle} · ${product.sku}`}
        actions={
          <>
            <ProductStatusBadge status={product.status} />
            <Button asChild variant="outline">
              <Link href={productsHref}>Back to catalog</Link>
            </Button>
          </>
        }
      />

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Product summary"
      >
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <Tag className="text-muted-foreground size-5" />
            <div>
              <p className="text-muted-foreground text-xs">Price</p>
              <p className="font-semibold">
                {formatMoney({
                  amountMinor: product.priceMinor,
                  currency: product.currency,
                })}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <PackageCheck className="text-muted-foreground size-5" />
            <div>
              <p className="text-muted-foreground text-xs">Authorized stock</p>
              <p className="font-semibold">
                {product.stock === null
                  ? "Service"
                  : product.stock.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <Eye className="text-muted-foreground size-5" />
            <div>
              <p className="text-muted-foreground text-xs">Performance</p>
              <p className="font-semibold">
                {product.views.toLocaleString()} views
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <CalendarClock className="text-muted-foreground size-5" />
            <div>
              <p className="text-muted-foreground text-xs">Last updated</p>
              <p className="font-semibold">{formatDate(product.updatedAt)}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <ProductDetailConsole
          key={product.version}
          tenantSlug={tenantSlug}
          product={product}
          categories={categoryNames}
          tags={tagOptions}
          canUpdate={canUpdate}
          canArchive={canArchive}
          isDemo={isDemo}
        />
        <aside className="space-y-6" aria-label="Product supporting details">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TagsIcon className="size-4" /> Tags
              </CardTitle>
              <CardDescription>
                Reusable labels assigned to this product.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {product.tags.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No tags are assigned.
                </p>
              ) : (
                product.tags.map((tag) => (
                  <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="size-4" /> Inventory by store
              </CardTitle>
              <CardDescription>
                Quantities from stores authorized for this workspace session.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.stock === null ? (
                <p className="text-muted-foreground text-sm">
                  Inventory tracking does not apply to this service product.
                </p>
              ) : product.inventory.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No authorized store inventory is available.
                </p>
              ) : (
                <ul className="divide-y">
                  {product.inventory.map((item) => (
                    <li
                      key={item.storeId}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{item.storeName}</p>
                        <p className="text-muted-foreground text-xs">
                          {item.storeCode}
                        </p>
                      </div>
                      <Badge
                        variant={
                          item.quantity === 0
                            ? "destructive"
                            : item.quantity <= product.reorderLevel
                              ? "warning"
                              : "success"
                        }
                      >
                        {item.quantity.toLocaleString()}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="size-4" /> Variants
              </CardTitle>
              <CardDescription>
                Sellable records linked to this product.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {product.variants.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No variants have been recorded.
                </p>
              ) : (
                <ul className="space-y-3">
                  {product.variants.map((variant) => (
                    <li key={variant.id} className="bg-muted/45 rounded-lg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{variant.name}</p>
                          <p className="text-muted-foreground font-mono text-xs">
                            {variant.sku}
                          </p>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatMoney({
                            amountMinor: variant.priceMinor,
                            currency: variant.currency,
                          })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 pt-5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Category</span>
                <span className="font-medium">{product.category}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Reorder threshold</span>
                <span className="font-medium">{product.reorderLevel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {formatDate(product.createdAt)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Record version</span>
                <span className="font-mono font-medium">{product.version}</span>
              </div>
              {product.status === "archived" && (
                <div className="text-foreground flex items-center gap-2 pt-2 text-xs">
                  <Archive className="text-destructive size-3.5" /> Retained as
                  an archived record
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
