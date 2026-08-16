"use client";

import {
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FolderTree,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Store,
  Sun,
  Tags,
  UserRound,
  UsersRound,
  Warehouse,
  X,
  type LucideIcon,
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

interface NavigationItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

interface NavigationGroup {
  id: "overview" | "catalog" | "inventory" | "manage";
  label: string;
  items: NavigationItem[];
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
  canViewBilling: true,
  canViewInventory: true,
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
  const [openGroups, setOpenGroups] = React.useState<
    Record<NavigationGroup["id"], boolean>
  >({ overview: true, catalog: true, inventory: true, manage: true });
  const base = `/app/${tenantSlug}`;
  const navigationGroups: NavigationGroup[] = [
    {
      id: "overview",
      label: "Overview",
      items: [{ label: "Dashboard", icon: LayoutDashboard, href: "" }],
    },
    {
      id: "catalog",
      label: "Catalog",
      items: [
        { label: "Products", icon: Boxes, href: "/products" },
        {
          label: "Product categories",
          icon: FolderTree,
          href: "/products/categories",
        },
        { label: "Tags", icon: Tags, href: "/products/tags" },
      ],
    },
    {
      id: "inventory",
      label: "Inventory",
      items: workspace.canViewInventory
        ? [
            { label: "Stock control", icon: Warehouse, href: "/inventory" },
            {
              label: "Availability",
              icon: Building2,
              href: "/inventory/availability",
            },
            {
              label: "Low-stock alerts",
              icon: Bell,
              href: "/inventory/alerts",
            },
          ]
        : [],
    },
    {
      id: "manage",
      label: "Manage",
      items: [
        ...(workspace.canViewMembers
          ? [
              {
                label: "Team",
                icon: UsersRound,
                href: "/settings/members",
              },
            ]
          : []),
        ...(workspace.canViewBilling
          ? [
              {
                label: "Plans & billing",
                icon: CreditCard,
                href: "/settings/billing",
              },
            ]
          : []),
      ],
    },
  ].filter((group) => group.items.length > 0) as NavigationGroup[];

  function isActive(item: NavigationItem): boolean {
    const href = `${base}${item.href}`;
    if (item.href === "") return pathname === base;
    if (item.href === "/products")
      return (
        (pathname === href || pathname.startsWith(`${href}/`)) &&
        !pathname.startsWith(`${href}/categories`) &&
        !pathname.startsWith(`${href}/tags`)
      );
    if (item.href === "/inventory")
      return (
        pathname === href ||
        pathname.startsWith(`${href}/adjustments`) ||
        pathname.startsWith(`${href}/transfers`)
      );
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function switchBusiness(targetSlug: string) {
    if (workspace.isDemo || targetSlug === tenantSlug) return;
    startSwitching(async () => {
      try {
        const target = await switchBusinessAction(targetSlug);
        router.push(`/app/${target.tenantSlug}`);
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
          "border-sidebar-border flex h-[68px] items-center gap-3 border-b px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <Link
          href={base}
          className="flex min-w-0 items-center gap-3 rounded-lg"
          aria-label={`${brand.name} dashboard`}
        >
          <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-[var(--shadow-button)]">
            {brand.logoMark}
          </span>
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">
              {brand.name}
            </span>
          )}
        </Link>
      </div>

      <div className={cn("px-3 pt-3 pb-2", collapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "border-sidebar-foreground/10 bg-sidebar hover:bg-sidebar-accent dark:bg-sidebar-foreground/5 dark:hover:bg-sidebar-foreground/10 flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors",
                collapsed &&
                  "justify-center border-transparent bg-transparent shadow-none",
              )}
              aria-label="Switch business"
              disabled={isSwitching}
            >
              <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                <Building2 className="size-4" />
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold tracking-[-0.01em]">
                      {workspace.businessName}
                    </span>
                    <span className="text-sidebar-foreground/70 mt-0.5 block truncate text-[11px]">
                      {workspace.planName} workspace
                    </span>
                  </span>
                  <ChevronDown className="text-sidebar-foreground/50 size-4" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="w-64">
            <DropdownMenuLabel>Switch business</DropdownMenuLabel>
            {workspace.businesses.map((business) => {
              const active = business.slug === tenantSlug;
              return (
                <DropdownMenuItem
                  key={business.tenantId}
                  onSelect={() => switchBusiness(business.slug)}
                  disabled={isSwitching}
                >
                  <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
                    <Building2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {business.name}
                    </span>
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

      <nav
        className={cn("flex-1 overflow-y-auto px-3 py-2", collapsed && "px-2")}
        aria-label="Primary navigation"
      >
        <div className="space-y-3">
          {navigationGroups.map((group) => (
            <div key={group.id}>
              {!collapsed && (
                <button
                  type="button"
                  className="text-sidebar-foreground/62 hover:text-sidebar-foreground flex h-7 w-full items-center justify-between rounded-md px-2 text-[10px] font-semibold tracking-[0.12em] uppercase transition-colors"
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [group.id]: !current[group.id],
                    }))
                  }
                  aria-expanded={openGroups[group.id]}
                  aria-controls={`sidebar-group-${group.id}`}
                >
                  {group.label}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      !openGroups[group.id] && "-rotate-90",
                    )}
                  />
                </button>
              )}
              {(collapsed || openGroups[group.id]) && (
                <div
                  id={`sidebar-group-${group.id}`}
                  className="mt-1 space-y-1"
                >
                  {group.items.map((item) => {
                    const href = `${base}${item.href}`;
                    const active = isActive(item);
                    return (
                      <Link
                        key={item.label}
                        href={href}
                        onClick={closeMobile}
                        title={collapsed ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "text-sidebar-foreground/62 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground relative flex h-10 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
                          active &&
                            "bg-sidebar-accent text-sidebar-accent-foreground font-semibold",
                          active &&
                            !collapsed &&
                            "before:bg-primary before:absolute before:top-2.5 before:-left-3 before:h-5 before:w-0.5 before:rounded-r-full",
                          collapsed && "justify-center px-2",
                        )}
                      >
                        <item.icon className="size-[17px] shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>

      <div
        className={cn(
          "border-sidebar-border space-y-2 border-t p-3",
          collapsed && "px-2",
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "hover:bg-sidebar-foreground/8 flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 text-sm transition-colors",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? `Store: ${workspace.storeName}` : undefined}
              aria-label={`Switch store. Current store: ${workspace.storeName}`}
              disabled={isSwitching || workspace.stores.length === 0}
            >
              <span className="bg-sidebar-foreground/8 text-sidebar-foreground/60 flex size-8 shrink-0 items-center justify-center rounded-md">
                <Store className="size-4" />
              </span>
              {!collapsed && (
                <>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="text-sidebar-foreground/62 block text-[10px] font-semibold tracking-wider uppercase">
                      Current store
                    </span>
                    <span className="block truncate text-xs font-medium">
                      {workspace.storeName}
                    </span>
                  </span>
                  <ChevronDown className="text-sidebar-foreground/45 size-3.5" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-64">
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

        {!collapsed && (
          <div className="border-sidebar-foreground/10 bg-sidebar dark:bg-sidebar-foreground/5 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium">Product usage</span>
              <span className="text-sidebar-foreground/65 tabular-nums">
                {workspace.productLimit
                  ? `${Math.min(100, Math.round((workspace.productCount / workspace.productLimit) * 100))}%`
                  : "Flexible"}
              </span>
            </div>
            <div className="bg-sidebar-foreground/10 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{
                  width: workspace.productLimit
                    ? `${Math.min(100, (workspace.productCount / workspace.productLimit) * 100)}%`
                    : "0%",
                }}
              />
            </div>
            <p className="text-sidebar-foreground/65 mt-2 text-[11px] tabular-nums">
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
    <div className="bg-background min-h-screen overflow-x-clip">
      <aside
        className={cn(
          "border-sidebar-border bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 hidden flex-col border-r transition-[width] duration-200 lg:flex",
          collapsed ? "w-[76px]" : "w-[264px]",
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
          className="bg-card absolute top-[82px] -right-4 size-8 rounded-full shadow-[var(--shadow-float)]"
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
          <aside className="bg-sidebar text-sidebar-foreground relative flex h-full w-[296px] max-w-[86vw] flex-col border-r shadow-[var(--shadow-float)]">
            <button
              className="text-sidebar-foreground/60 hover:bg-sidebar-foreground/10 absolute top-4 right-3 rounded-lg p-1.5"
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
          collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]",
        )}
      >
        <header className="bg-background/90 sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <Link
            href={`/app/${tenantSlug}`}
            className="mr-auto flex items-center gap-2 text-sm font-semibold md:hidden"
          >
            <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg text-[11px]">
              {brand.logoMark}
            </span>
            {brand.name}
          </Link>
          <div className="relative hidden w-full max-w-md md:block">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              className="bg-card/85 h-10 pr-14 pl-9"
              placeholder="Search products, people, or settings…"
              aria-label="Global search"
            />
            <kbd className="bg-muted text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-md border px-1.5 py-0.5 text-[10px] font-medium">
              ⌘K
            </kbd>
          </div>
          <div className="ml-auto hidden items-center gap-2 xl:flex">
            <span className="text-muted-foreground bg-card/70 flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium shadow-[var(--shadow-button)]">
              <Store className="size-3.5" />
              <span className="max-w-40 truncate">{workspace.storeName}</span>
            </span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="hidden min-[360px]:inline-flex"
              asChild
            >
              <a
                href={`mailto:${brand.supportEmail}`}
                aria-label="Contact help"
              >
                <CircleHelp />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden min-[360px]:inline-flex"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative"
                  aria-label="Notifications"
                >
                  <Bell />
                  <span className="bg-destructive ring-background absolute top-2 right-2 size-1.5 rounded-full ring-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-3 py-5 text-center">
                  <p className="text-sm font-medium">You’re all caught up</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    New workspace alerts will appear here.
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-full p-0.5 sm:rounded-lg sm:pr-2">
                  <Avatar className="ring-card size-9 ring-2">
                    <AvatarFallback>
                      {initials(workspace.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden min-w-0 text-left 2xl:block">
                    <span className="block max-w-28 truncate text-xs font-semibold">
                      {workspace.userName}
                    </span>
                    <span className="text-muted-foreground block text-[10px]">
                      {workspace.planName} plan
                    </span>
                  </span>
                  <ChevronDown className="text-muted-foreground hidden size-3.5 2xl:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <span className="text-foreground block">
                    {workspace.userName}
                  </span>
                  <span className="truncate font-normal">
                    {workspace.userEmail}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <UserRound /> Account profile
                </DropdownMenuItem>
                {workspace.canViewMembers && (
                  <DropdownMenuItem asChild>
                    <Link href={`/app/${tenantSlug}/settings/members`}>
                      <Settings /> Workspace settings
                    </Link>
                  </DropdownMenuItem>
                )}
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
        <main className="min-h-[calc(100vh-68px)] min-w-0">{children}</main>
      </div>
    </div>
  );
}
