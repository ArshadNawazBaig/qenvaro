"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerListQuery } from "@/modules/customers/schemas";

export function CustomerToolbar({ query }: { query: CustomerListQuery }) {
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

  const filtered =
    query.q ||
    query.status !== "all" ||
    query.sort !== "name" ||
    query.direction !== "asc";

  return (
    <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center lg:p-4">
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
          placeholder="Search name, code, company, or contact"
          aria-label="Search customers"
        />
      </form>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:flex">
        <select
          value={query.status}
          onChange={(event) => update("status", event.target.value)}
          className="bg-card h-9 min-w-0 rounded-md border px-3 text-xs font-medium lg:min-w-36"
          aria-label="Filter customer status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={query.sort}
          onChange={(event) => update("sort", event.target.value)}
          className="bg-card h-9 min-w-0 rounded-md border px-3 text-xs font-medium lg:min-w-36"
          aria-label="Sort customers"
        >
          <option value="name">Sort: Name</option>
          <option value="updatedAt">Sort: Updated</option>
          <option value="createdAt">Sort: Newest</option>
        </select>
        <select
          value={query.direction}
          onChange={(event) => update("direction", event.target.value)}
          className="bg-card h-9 min-w-0 rounded-md border px-3 text-xs font-medium lg:min-w-32"
          aria-label="Customer sort direction"
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
      </div>
      {filtered && (
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
