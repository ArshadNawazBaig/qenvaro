"use client";

import {
  Boxes,
  LoaderCircle,
  Search,
  Settings,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GlobalSearchResult } from "@/modules/search/schemas";

const resultIcons = {
  product: Boxes,
  customer: UsersRound,
  employee: UserRound,
  setting: Settings,
} as const;

const demoResults: GlobalSearchResult[] = [
  {
    id: "demo-products",
    kind: "product",
    title: "Product catalog",
    description: "Browse demo products and inventory",
    href: "/app/demo/products",
  },
  {
    id: "demo-customers",
    kind: "customer",
    title: "Customers",
    description: "Search the demo customer directory",
    href: "/app/demo/customers",
  },
  {
    id: "demo-employees",
    kind: "employee",
    title: "Employees",
    description: "Browse the demo workforce",
    href: "/app/demo/employees",
  },
  {
    id: "demo-settings",
    kind: "setting",
    title: "Business settings",
    description: "Currency, locale, timezone, and defaults",
    href: "/app/demo/settings/business",
  },
];

export function GlobalSearch({
  tenantSlug,
  isDemo,
}: {
  tenantSlug: string;
  isDemo: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GlobalSearchResult[]>([]);
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        if (isDemo) {
          const search = normalized.toLocaleLowerCase();
          setResults(
            demoResults.filter((result) =>
              `${result.title} ${result.description}`
                .toLocaleLowerCase()
                .includes(search),
            ),
          );
          setStatus("ready");
          return;
        }
        setStatus("loading");
        try {
          const response = await fetch(
            `/api/app/${encodeURIComponent(tenantSlug)}/search?q=${encodeURIComponent(normalized)}`,
            { signal: controller.signal },
          );
          const body = (await response.json()) as {
            ok: boolean;
            results?: GlobalSearchResult[];
          };
          if (!response.ok || !body.ok) throw new Error("Search failed");
          setResults(body.results ?? []);
          setStatus("ready");
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setResults([]);
          setStatus("error");
        }
      },
      isDemo ? 0 : 250,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isDemo, query, tenantSlug]);

  return (
    <>
      <button
        type="button"
        className="border-border/60 bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground hidden h-10 w-full max-w-md items-center rounded-full border px-3 text-left text-sm shadow-[var(--shadow-button)] transition-colors md:flex"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
      >
        <Search className="mr-2 size-4 shrink-0" />
        <span className="truncate">Search products, people, or settings…</span>
        <kbd className="bg-muted ml-auto rounded-md border px-1.5 py-0.5 text-[10px] font-medium">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        className="hover:bg-accent inline-flex size-10 shrink-0 items-center justify-center rounded-full md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open global search"
      >
        <Search className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[8vh] max-w-xl translate-y-0 p-0 sm:top-[12vh] sm:translate-y-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <DialogTitle className="sr-only">Search workspace</DialogTitle>
          <DialogDescription className="sr-only">
            Search permitted products, customers, employees, and settings.
          </DialogDescription>
          <div className="relative border-b p-3 pr-12">
            <Search className="text-muted-foreground absolute top-1/2 left-6 size-4 -translate-y-1/2" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setResults([]);
                setStatus(nextQuery.trim().length < 2 ? "idle" : "loading");
              }}
              className="h-11 border-0 bg-transparent pr-3 pl-10 shadow-none focus-visible:ring-0"
              placeholder="Search products, people, or settings…"
              aria-label="Search products, people, or settings"
              role="combobox"
              aria-expanded={open}
              aria-controls="global-search-results"
              autoComplete="off"
            />
          </div>
          <div
            id="global-search-results"
            className="max-h-[min(440px,60vh)] min-h-44 overflow-y-auto p-2"
          >
            {status === "idle" && (
              <p className="text-muted-foreground px-4 py-12 text-center text-sm">
                Enter at least two characters to search this workspace.
              </p>
            )}
            {status === "loading" && (
              <p className="text-muted-foreground flex items-center justify-center gap-2 px-4 py-12 text-sm">
                <LoaderCircle className="size-4 animate-spin" /> Searching…
              </p>
            )}
            {status === "error" && (
              <p
                role="alert"
                className="text-destructive px-4 py-12 text-center text-sm"
              >
                Search is temporarily unavailable. Try again.
              </p>
            )}
            {status === "ready" && results.length === 0 && (
              <p className="text-muted-foreground px-4 py-12 text-center text-sm">
                No permitted results found for “{query.trim()}”.
              </p>
            )}
            {results.length > 0 && (
              <ul className="space-y-1" aria-label="Search results">
                {results.map((result) => {
                  const Icon = resultIcons[result.kind];
                  return (
                    <li key={result.id}>
                      <Link
                        href={result.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "hover:bg-accent focus-visible:bg-accent flex items-center gap-3 rounded-xl px-3 py-2.5 outline-none",
                        )}
                      >
                        <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {result.title}
                          </span>
                          <span className="text-muted-foreground block truncate text-xs">
                            {result.description}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="text-muted-foreground border-t px-4 py-2 text-[11px]">
            Results follow your role and assigned-store access.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
