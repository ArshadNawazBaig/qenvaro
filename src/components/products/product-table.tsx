"use client";

import {
  columnVisibilityFeature,
  type ColumnVisibilityState,
  type ColumnDef,
  flexRender,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { bulkProductStatusAction } from "@/app/app/[tenantSlug]/products/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/modules/products/schemas";
import { EmptyState } from "@/components/shared/states";

const toneClasses = {
  sky: "from-sky-300 to-blue-600",
  ink: "from-slate-400 to-slate-900",
  mint: "from-emerald-200 to-teal-600",
  sand: "from-amber-100 to-orange-400",
  berry: "from-pink-200 to-fuchsia-700",
  slate: "from-slate-100 to-slate-500",
} as const;
const productTableFeatures = tableFeatures({
  rowSelectionFeature,
  columnVisibilityFeature,
});
const columnLabels: Record<string, string> = {
  sku: "SKU / slug",
  priceMinor: "Price",
  stock: "Stock",
  category: "Category",
  status: "Status",
  performance: "Performance",
};
function StockBadge({ product }: { product: ProductListItem }) {
  if (product.stock === null) return <Badge variant="outline">Service</Badge>;
  if (product.stock === 0)
    return <Badge variant="destructive">Out of stock</Badge>;
  if (product.stock <= product.reorderLevel)
    return <Badge variant="warning">{product.stock} low</Badge>;
  return (
    <Badge variant="success">{product.stock.toLocaleString()} in stock</Badge>
  );
}
function StatusBadge({ status }: { status: ProductListItem["status"] }) {
  const variant =
    status === "active" ? "success" : status === "draft" ? "info" : "secondary";
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

export function ProductTable({
  items,
  page,
  pageCount,
  total,
  tenantSlug,
  canUpdate,
  canArchive,
  isDemo,
}: {
  items: ProductListItem[];
  page: number;
  pageCount: number;
  total: number;
  tenantSlug: string;
  canUpdate: boolean;
  canArchive: boolean;
  isDemo: boolean;
}) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<ColumnVisibilityState>({});
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] =
    React.useState(false);
  const [bulkPending, startBulkTransition] = React.useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const goToPage = (nextPage: number) => {
    const next = new URLSearchParams(params.toString());
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    router.push(`${pathname}?${next.toString()}`);
  };
  const columns = React.useMemo<
    ColumnDef<typeof productTableFeatures, ProductListItem, unknown>[]
  >(
    () => [
      {
        id: "select",
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllRowsSelected() ||
              (table.getIsSomeRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllRowsSelected(Boolean(value))
            }
            aria-label="Select all products on this page"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
            aria-label={`Select ${row.original.name}`}
          />
        ),
      },
      {
        accessorKey: "name",
        enableHiding: false,
        header: "Product",
        cell: ({ row }) => (
          <div className="flex min-w-48 items-center gap-3">
            {row.original.primaryImage ? (
              <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-lg border">
                <Image
                  src={row.original.primaryImage.url}
                  alt={row.original.primaryImage.altText}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div
                className={cn(
                  "relative size-10 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br",
                  toneClasses[row.original.imageTone],
                )}
                aria-hidden="true"
              >
                <span className="absolute right-1 bottom-0 text-lg font-bold text-white/75">
                  {row.original.name.charAt(0)}
                </span>
              </div>
            )}
            <div>
              <Link
                href={`/app/${tenantSlug}/products/${row.original.id}`}
                className="text-foreground hover:text-primary font-semibold hover:underline"
              >
                {row.original.name}
              </Link>
              <p className="text-muted-foreground max-w-44 truncate text-xs">
                {row.original.subtitle}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "sku",
        header: "SKU / slug",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.sku}</p>
            <p className="text-muted-foreground text-xs">{row.original.slug}</p>
          </div>
        ),
      },
      {
        accessorKey: "priceMinor",
        header: "Price",
        cell: ({ row }) => (
          <span className="font-medium">
            {formatMoney({
              amountMinor: row.original.priceMinor,
              currency: row.original.currency,
            })}
          </span>
        ),
      },
      {
        accessorKey: "stock",
        header: "Stock",
        cell: ({ row }) => <StockBadge product={row.original} />,
      },
      { accessorKey: "category", header: "Category" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "performance",
        header: "Performance",
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <span className="font-medium">
              {row.original.views >= 1000
                ? `${(row.original.views / 1000).toFixed(1)}K`
                : row.original.views}{" "}
              views
            </span>
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              {formatMoney({
                amountMinor: row.original.revenueMinor,
                currency: row.original.currency,
              })}
            </span>
          </div>
        ),
      },
      {
        id: "actions",
        enableHiding: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${row.original.name}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/app/${tenantSlug}/products/${row.original.id}`}>
                  <Eye /> View details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild={
                  canUpdate && !isDemo && row.original.status !== "archived"
                }
                disabled={
                  !canUpdate || isDemo || row.original.status === "archived"
                }
              >
                {canUpdate && !isDemo && row.original.status !== "archived" ? (
                  <Link
                    href={`/app/${tenantSlug}/products/${row.original.id}#edit`}
                  >
                    <Pencil /> Edit product
                  </Link>
                ) : (
                  <span>
                    <Pencil /> Edit product
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                asChild={
                  canArchive && !isDemo && row.original.status !== "archived"
                }
                disabled={
                  !canArchive || isDemo || row.original.status === "archived"
                }
                className="text-destructive"
              >
                {canArchive && !isDemo && row.original.status !== "archived" ? (
                  <Link
                    href={`/app/${tenantSlug}/products/${row.original.id}#archive`}
                  >
                    <Archive /> Archive
                  </Link>
                ) : (
                  <span>
                    <Archive /> Archive
                  </span>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [canArchive, canUpdate, isDemo, tenantSlug],
  );
  const table = useTable({
    features: productTableFeatures,
    data: items,
    columns,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => row.id,
  });
  const selected = table.getSelectedRowModel().rows.length;
  const selectedProducts = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);
  const canActivateSelection =
    canUpdate &&
    !isDemo &&
    !bulkPending &&
    selectedProducts.some((product) => product.status === "draft") &&
    selectedProducts.every((product) => product.status !== "archived");
  const canArchiveSelection =
    canArchive &&
    !isDemo &&
    !bulkPending &&
    selectedProducts.some((product) => product.status !== "archived");
  const runBulkAction = (status: "active" | "archived") => {
    const productIds = selectedProducts.map((product) => product.id);
    startBulkTransition(async () => {
      const result = await bulkProductStatusAction(
        tenantSlug,
        productIds,
        status,
      );
      if (result.status === "success") {
        toast.success(result.message);
        setRowSelection({});
        setArchiveConfirmationOpen(false);
        router.refresh();
      } else toast.error(result.message);
    });
  };
  if (items.length === 0)
    return (
      <div className="p-4">
        <EmptyState
          action={
            params.toString() ? (
              <Button variant="outline" onClick={() => router.push(pathname)}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  return (
    <>
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Product table"
      >
        <table className="w-full min-w-[1050px] text-left text-xs">
          <thead className="bg-muted/45 text-muted-foreground border-b">
            <tr>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    "h-11 px-3 font-medium",
                    header.id === "select" && "w-10 pl-4",
                    header.id === "actions" && "w-12",
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                className="hover:bg-muted/30 data-[state=selected]:bg-accent/55 border-b transition-colors last:border-0"
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "h-[72px] px-3",
                      cell.column.id === "select" && "pl-4",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {selected > 0 && (
          <div className="bg-foreground text-background sticky bottom-4 left-1/2 z-10 mx-auto -mt-14 flex w-fit -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 shadow-xl">
            <span className="pr-2 text-xs font-medium">
              {selected} selected
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canActivateSelection}
              onClick={() => runBulkAction("active")}
            >
              Activate
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!canArchiveSelection}
              onClick={() => setArchiveConfirmationOpen(true)}
            >
              Archive
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-background hover:text-foreground"
              onClick={() => setRowSelection({})}
              aria-label="Clear selection"
            >
              ×
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center">
        <p className="text-muted-foreground text-xs">
          Showing {items.length} of {total} products
        </p>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal /> Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(checked) =>
                      column.toggleVisibility(Boolean(checked))
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    {columnLabels[column.id] ?? column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-muted-foreground px-2 text-xs">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            disabled={page >= pageCount}
            onClick={() => goToPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <ConfirmActionDialog
        open={archiveConfirmationOpen}
        onOpenChange={setArchiveConfirmationOpen}
        title={`Archive ${selected.toLocaleString()} ${selected === 1 ? "product" : "products"}?`}
        description="Archived products are removed from active sales workflows. Existing inventory quantities and audit history will be preserved."
        confirmLabel="Archive products"
        destructive
        pending={bulkPending}
        onConfirm={() => runBulkAction("archived")}
      />
    </>
  );
}
