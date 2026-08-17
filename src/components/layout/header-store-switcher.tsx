"use client";

import { Check, ChevronDown, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { switchStoreAction } from "@/app/app/[tenantSlug]/workspace-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceShellData } from "@/server/tenancy/workspace";

interface HeaderStoreSwitcherProps {
  activeStoreId: string | null;
  isDemo: boolean;
  storeName: string;
  stores: WorkspaceShellData["stores"];
  tenantSlug: string;
}

export function HeaderStoreSwitcher({
  activeStoreId,
  isDemo,
  storeName,
  stores,
  tenantSlug,
}: HeaderStoreSwitcherProps) {
  const router = useRouter();
  const [isSwitching, startSwitching] = React.useTransition();

  function switchStore(storeId: string) {
    if (isDemo || storeId === activeStoreId) return;
    startSwitching(async () => {
      try {
        await switchStoreAction(tenantSlug, storeId);
        router.refresh();
      } catch {
        toast.error("We could not switch stores. Try again.");
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="border-border/55 bg-card text-muted-foreground hover:border-primary/20 hover:text-foreground flex size-9 shrink-0 items-center justify-center gap-2 rounded-full border shadow-[var(--shadow-button)] transition-[border-color,color,background-color] xl:h-10 xl:w-auto xl:px-3"
          aria-label={`Switch store. Current store: ${storeName}`}
          disabled={isSwitching || stores.length === 0}
        >
          <Store className="size-4 shrink-0" />
          <span className="text-foreground hidden max-w-40 truncate text-xs font-medium xl:block">
            {storeName}
          </span>
          <ChevronDown className="hidden size-3.5 shrink-0 xl:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Select store</DropdownMenuLabel>
        {stores.map((store) => (
          <DropdownMenuItem
            key={store.id}
            onSelect={() => switchStore(store.id)}
            disabled={isSwitching}
          >
            <span className="bg-primary/8 text-primary flex size-8 items-center justify-center rounded-lg">
              <Store className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{store.name}</span>
              <span className="text-muted-foreground block text-[10px]">
                {store.code}
              </span>
            </span>
            {store.id === activeStoreId && (
              <Check className="text-primary size-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
