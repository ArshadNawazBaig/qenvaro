"use client";

import {
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Store,
  Sun,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import {
  switchBusinessAction,
  switchStoreAction,
} from "@/app/app/[tenantSlug]/workspace-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { brand } from "@/config/brand";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import type { WorkspaceShellData } from "@/server/tenancy/workspace";

interface AppShellProps {
  tenantSlug: string;
  workspace?: WorkspaceShellData;
  children: React.ReactNode;
}

const demoWorkspace: WorkspaceShellData = {
  businessName: "Northstar Goods",
  planName: "Growth",
  storeName: "Downtown",
  userName: "Avery Nelson",
  userEmail: "owner@northstar.test",
  productCount: 6_824,
  productLimit: 10_000,
  businesses: [
    {
      tenantId: "demo",
      slug: "demo",
      name: "Northstar Goods",
      planName: "Growth",
    },
  ],
  stores: [{ id: "demo-store", code: "DT", name: "Downtown" }],
  activeStoreId: "demo-store",
  canViewMembers: true,
  isDemo: true,
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

const primaryNavigation = [
  { label: "Dashboard", icon: LayoutDashboard, href: "" },
  { label: "Products", icon: Boxes, href: "/products" },
] as const;

function SidebarContent({
  tenantSlug,
  workspace,
  collapsed,
  closeMobile,
}: {
  tenantSlug: string;
  workspace: WorkspaceShellData;
  collapsed: boolean;
  closeMobile?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSwitching, startSwitching] = React.useTransition();
  const base = `/app/${tenantSlug}`;
  const navigation = workspace.canViewMembers
    ? [
        ...primaryNavigation,
        { label: "Team", icon: UsersRound, href: "/settings/members" },
      ]
    : primaryNavigation;

  function switchBusiness(targetSlug: string) {
    if (workspace.isDemo || targetSlug === tenantSlug) return;
    startSwitching(async () => {
      try {
        await switchBusinessAction(targetSlug);
      } catch {
        toast.error("We could not switch businesses. Try again.");
      }
    });
  }

  function switchStore(storeId: string) {
    if (workspace.isDemo || storeId === workspace.activeStoreId) return;
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
    <>
      <div
        className={cn(
          "border-sidebar-border flex h-16 items-center gap-3 border-b px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
          {brand.logoMark}
        </div>
        {!collapsed && (
          <span className="font-semibold tracking-tight">{brand.name}</span>
        )}
      </div>

      <div className={cn("p-3", collapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "bg-card hover:bg-accent flex w-full items-center gap-3 rounded-lg border p-2 text-left shadow-sm",
                collapsed &&
                  "justify-center border-transparent bg-transparent shadow-none",
              )}
              aria-label="Switch business"
              disabled={isSwitching}
            >
              <span className="bg-accent text-accent-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
                <Building2 className="size-4" />
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {workspace.businessName}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {workspace.planName} plan
                    </span>
                  </span>
                  <ChevronDown className="text-muted-foreground size-4" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-60">
            <DropdownMenuLabel>Businesses</DropdownMenuLabel>
            {workspace.businesses.map((business) => {
              const active = business.slug === tenantSlug;
              return (
                <DropdownMenuItem
                  key={business.tenantId}
                  onSelect={() => switchBusiness(business.slug)}
                  disabled={isSwitching}
                >
                  <Building2 />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{business.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {business.planName} plan
                    </span>
                  </span>
                  {active && <Check className="text-primary size-4" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <nav className="flex-1 space-y-1 px-3" aria-label="Primary navigation">
        {!collapsed && (
          <p className="text-muted-foreground px-2 pb-2 text-[11px] font-semibold tracking-wider uppercase">
            Workspace
          </p>
        )}
        {navigation.map((item) => {
          const href = `${base}${item.href}`;
          const active =
            item.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={item.label}
              href={href}
              onClick={closeMobile}
              title={collapsed ? item.label : undefined}
              className={cn(
                "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
                active && "bg-sidebar-accent text-sidebar-foreground",
                collapsed && "justify-center px-2",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-sidebar-border space-y-1 border-t p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? `Store: ${workspace.storeName}` : undefined}
              aria-label={`Switch store. Current store: ${workspace.storeName}`}
              disabled={isSwitching || workspace.stores.length === 0}
            >
              <Store className="size-4" />
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {workspace.storeName}
                  </span>
                  <ChevronDown className="size-3.5" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-60">
            <DropdownMenuLabel>Active store</DropdownMenuLabel>
            {workspace.stores.map((store) => (
              <DropdownMenuItem
                key={store.id}
                onSelect={() => switchStore(store.id)}
                disabled={isSwitching}
              >
                <Store />
                <span className="min-w-0 flex-1 truncate">{store.name}</span>
                <span className="text-muted-foreground text-xs">
                  {store.code}
                </span>
                {store.id === workspace.activeStoreId && (
                  <Check className="text-primary size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {workspace.canViewMembers && (
          <Link
            href={`${base}/settings/members`}
            onClick={closeMobile}
            className={cn(
              "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium",
              pathname.startsWith(`${base}/settings`) &&
                "bg-sidebar-accent text-sidebar-foreground",
              collapsed && "justify-center px-2",
            )}
            title={collapsed ? "Settings" : undefined}
          >
            <Settings className="size-4" />
            {!collapsed && "Settings"}
          </Link>
        )}
        {!collapsed && (
          <div className="bg-card mt-3 rounded-lg border p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">Product usage</span>
              <span className="text-muted-foreground">
                {workspace.productLimit
                  ? `${Math.min(100, Math.round((workspace.productCount / workspace.productLimit) * 100))}%`
                  : "Flexible"}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{
                  width: workspace.productLimit
                    ? `${Math.min(100, (workspace.productCount / workspace.productLimit) * 100)}%`
                    : "0%",
                }}
              />
            </div>
            <p className="text-muted-foreground mt-2 text-[11px]">
              {workspace.productCount.toLocaleString()}
              {workspace.productLimit
                ? ` of ${workspace.productLimit.toLocaleString()}`
                : ""}{" "}
              products
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export function AppShell({
  tenantSlug,
  workspace = demoWorkspace,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();

  return (
    <div className="bg-background min-h-screen">
      <aside
        className={cn(
          "border-sidebar-border bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 hidden flex-col border-r transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-[252px]",
        )}
      >
        <SidebarContent
          tenantSlug={tenantSlug}
          workspace={workspace}
          collapsed={collapsed}
        />
        <Button
          variant="outline"
          size="icon"
          className="bg-card absolute top-[76px] -right-4 size-8 rounded-full"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="bg-foreground/25 absolute inset-0 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="bg-sidebar relative flex h-full w-[280px] flex-col border-r shadow-xl">
            <button
              className="text-muted-foreground hover:bg-sidebar-accent absolute top-4 right-3 rounded-md p-1"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
            <SidebarContent
              tenantSlug={tenantSlug}
              workspace={workspace}
              collapsed={false}
              closeMobile={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div
        className={cn(
          "transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-[252px]",
        )}
      >
        <header className="bg-background/92 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <div className="relative hidden w-full max-w-sm md:block">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="bg-card h-9 pl-9"
              placeholder="Search anything…"
              aria-label="Global search"
            />
            <kbd className="bg-muted text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Help">
              <CircleHelp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label="Notifications"
            >
              <Bell />
              <span className="bg-destructive absolute top-2 right-2 size-1.5 rounded-full" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 rounded-full">
                <Avatar>
                  <AvatarFallback>
                    {initials(workspace.userName)}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="text-foreground block">
                    {workspace.userName}
                  </span>
                  <span className="truncate font-normal">
                    {workspace.userEmail}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserRound /> Account
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={workspace.isDemo}
                  onSelect={async () => {
                    await authClient.signOut();
                    router.replace("/sign-in");
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
