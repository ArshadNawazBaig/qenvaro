"use client";

import { ArrowDownAZ, ArrowUpAZ, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CategoryListQuery } from "@/modules/categories/schemas";

export function CategoryToolbar({ query }: { query: CategoryListQuery }) {
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
  const hasFilters = Boolean(query.q || query.status !== "all");
  return (
    <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
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
          className="pl-9"
          placeholder="Search categories, descriptions, or slugs"
          aria-label="Search categories"
        />
      </form>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 lg:pb-0">
        <label>
          <span className="sr-only">Category status</span>
          <select
            value={query.status}
            onChange={(event) => update("status", event.target.value)}
            className="bg-card h-9 min-w-36 rounded-md border px-3 text-xs font-medium"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort categories</span>
          <select
            value={query.sort}
            onChange={(event) => update("sort", event.target.value)}
            className="bg-card h-9 min-w-36 rounded-md border px-3 text-xs font-medium"
          >
            <option value="name">Sort: Name</option>
            <option value="products">Sort: Products</option>
            <option value="updatedAt">Sort: Updated</option>
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={
            query.direction === "asc" ? "Sort descending" : "Sort ascending"
          }
          onClick={() =>
            update("direction", query.direction === "asc" ? "desc" : "asc")
          }
        >
          {query.direction === "asc" ? <ArrowDownAZ /> : <ArrowUpAZ />}
        </Button>
        {hasFilters && (
          <Button
            type="button"
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
      </div>
    </div>
  );
}
