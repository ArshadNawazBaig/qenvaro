"use client";

import { ListFilter, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductListQuery } from "@/modules/products/schemas";
import type { TagOption } from "@/modules/tags/schemas";

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-32">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-card h-10 w-full appearance-none rounded-lg border px-3 pr-8 text-xs font-medium shadow-[var(--shadow-button)]"
        style={{
          backgroundImage:
            "linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%)",
          backgroundPosition: "calc(100% - 14px) 50%,calc(100% - 10px) 50%",
          backgroundSize: "4px 4px,4px 4px",
          backgroundRepeat: "no-repeat",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

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
    <div className="flex flex-col gap-3 border-b p-3 sm:p-4 lg:flex-row lg:items-center">
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
          className="pl-9 lg:min-w-72"
          placeholder="Search products, SKU, or slug"
          aria-label="Search products"
        />
      </form>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:pb-0">
        <FilterSelect
          label="Category"
          value={query.category}
          onChange={(value) => update("category", value)}
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
          onChange={(value) => update("stock", value)}
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
          onChange={(value) => update("tag", value)}
          options={[
            { label: "All tags", value: "all" },
            ...tags.map((tag) => ({ label: tag.name, value: tag.id })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={query.status}
          onChange={(value) => update("status", value)}
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
          onChange={(value) => update("sort", value)}
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
