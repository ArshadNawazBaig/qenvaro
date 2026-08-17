"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { FilterSelect } from "@/components/shared/filter-select";
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
      <FilterSelect
        label="Filter unit status"
        value={query.status}
        onChange={(event) => update("status", event.target.value)}
        options={[
          { value: "all", label: "All statuses" },
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
        ]}
      />
      <FilterSelect
        label="Sort units"
        value={query.sort}
        onChange={(event) => update("sort", event.target.value)}
        options={[
          { value: "name", label: "Sort: Name" },
          { value: "products", label: "Sort: Products" },
          { value: "updatedAt", label: "Sort: Updated" },
        ]}
      />
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
