"use client";

import { ListFilter, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { FilterSelect } from "@/components/shared/filter-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductListQuery } from "@/modules/products/schemas";
import type { TagOption } from "@/modules/tags/schemas";

export function ProductToolbar({
  query,
  categories,
  tags,
}: {
  query: ProductListQuery;
  categories: string[];
  tags: TagOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(query.q);
  const update = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );
  const hasFilters = Boolean(
    query.q ||
    query.category !== "all" ||
    query.tag !== "all" ||
    query.stock !== "all" ||
    query.status !== "all",
  );

  return (
    <div className="flex flex-col gap-3 border-b p-3 min-[1380px]:flex-row min-[1380px]:items-center sm:p-4">
      <form
        className="relative min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          update("q", search.trim());
        }}
      >
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9 min-[1380px]:min-w-72"
          placeholder="Search products, SKU, or slug"
          aria-label="Search products"
        />
      </form>
      <div className="grid w-full min-w-0 grid-cols-2 gap-2 min-[1380px]:w-auto min-[1380px]:pb-0 sm:flex sm:max-w-full sm:overflow-x-auto sm:pb-1">
        <FilterSelect
          label="Category"
          value={query.category}
          onValueChange={(value) => update("category", value)}
          options={[
            { label: "All categories", value: "all" },
            ...categories.map((category) => ({
              label: category,
              value: category,
            })),
          ]}
        />
        <FilterSelect
          label="Stock"
          value={query.stock}
          onValueChange={(value) => update("stock", value)}
          options={[
            { label: "All stock", value: "all" },
            { label: "In stock", value: "in-stock" },
            { label: "Low stock", value: "low" },
            { label: "Out of stock", value: "out" },
            { label: "Services", value: "service" },
          ]}
        />
        <FilterSelect
          label="Tag"
          value={query.tag}
          onValueChange={(value) => update("tag", value)}
          options={[
            { label: "All tags", value: "all" },
            ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={query.status}
          onValueChange={(value) => update("status", value)}
          options={[
            { label: "All status", value: "all" },
            { label: "Active", value: "active" },
            { label: "Draft", value: "draft" },
            { label: "Archived", value: "archived" },
          ]}
        />
        <FilterSelect
          label="Sort"
          value={query.sort}
          onValueChange={(value) => update("sort", value)}
          options={[
            { label: "Sort: Revenue", value: "revenue" },
            { label: "Sort: Name", value: "name" },
            { label: "Sort: Price", value: "price" },
            { label: "Sort: Stock", value: "stock" },
          ]}
        />
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              router.push(pathname);
            }}
          >
            <X /> Clear
          </Button>
        )}
        {!hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            className="justify-self-start"
            aria-label="More filters"
            disabled
            title="Store filters arrive with a future catalog slice"
          >
            <ListFilter />
          </Button>
        )}
      </div>
    </div>
  );
}
