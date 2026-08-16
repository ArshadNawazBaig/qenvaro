"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UnitListQuery } from "@/modules/units/schemas";

export function UnitToolbar({ query }: { query: UnitListQuery }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = React.useState(query.q);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:p-4">
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
          placeholder="Search name, symbol, or description"
          aria-label="Search units"
        />
      </form>
      <select
        value={query.status}
        onChange={(event) => update("status", event.target.value)}
        className="bg-card h-9 min-w-36 rounded-md border px-3 text-xs font-medium"
        aria-label="Filter unit status"
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <select
        value={query.sort}
        onChange={(event) => update("sort", event.target.value)}
        className="bg-card h-9 min-w-36 rounded-md border px-3 text-xs font-medium"
        aria-label="Sort units"
      >
        <option value="name">Sort: Name</option>
        <option value="products">Sort: Products</option>
        <option value="updatedAt">Sort: Updated</option>
      </select>
      {(query.q || query.status !== "all" || query.sort !== "name") && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            router.push(pathname);
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
