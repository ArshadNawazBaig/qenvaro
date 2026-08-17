"use client";

import {
  Bell,
  Boxes,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  CreditCard,
  FolderTree,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Receipt,
  Ruler,
  Settings,
  ShoppingCart,
  Sun,
  Tags,
  TrendingUp,
  UserRound,
  UsersRound,
  Warehouse,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { switchBusinessAction } from "@/app/app/[tenantSlug]/workspace-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HeaderStoreSwitcher } from "@/components/layout/header-store-switcher";
import { GlobalSearch } from "@/components/layout/global-search";
import { SidebarPlanCard } from "@/components/layout/sidebar-plan-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  id:
    | "overview"
    | "catalog"
    | "inventory"
    | "sales"
    | "people"
    | "operations"
    | "manage";
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
  notificationUnread: 1,
  recentNotifications: [
    {
      id: "demo-low-stock",
      title: "Low stock requires attention",
      severity: "warning",
      href: "/app/demo/inventory/alerts",
      read: false,
    },
  ],
  canViewMembers: true,
  canViewBilling: true,
  canViewInventory: true,
  canViewCustomers: true,
  canCreateSales: true,
  canViewSales: true,
  canViewReports: true,
  canViewEmployees: true,
  canViewAttendance: true,
  canViewPayroll: true,
  canViewPurchasing: true,
  canViewExpenses: true,
  canViewSettings: true,
  canViewAudit: true,
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
  const [openGroups, setOpenGroups] = React.useState<
    Record<NavigationGroup["id"], boolean>
  >({
    overview: true,
    catalog: true,
    inventory: true,
    sales: true,
    people: true,
    operations: true,
    manage: true,
  });
  const base = `/app/${tenantSlug}`;
  const navigationGroups: NavigationGroup[] = [
    {
      id: "overview",
      label: "Overview",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: "" },
        { label: "Notifications", icon: Bell, href: "/notifications" },
      ],
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
        { label: "Units of measure", icon: Ruler, href: "/products/units" },
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
      id: "sales",
      label: "Sales",
      items: [
        ...(workspace.canViewSales
          ? [
              {
                label: "Sales history",
                icon: ReceiptText,
                href: "/sales",
              },
            ]
          : []),
        ...(workspace.canCreateSales
          ? [
              {
                label: "New sale",
                icon: ShoppingCart,
                href: "/sales/new",
              },
            ]
          : []),
        ...(workspace.canViewReports
          ? [
              {
                label: "Sales report",
                icon: ChartNoAxesCombined,
                href: "/reports/sales",
              },
            ]
          : []),
        ...(workspace.canViewCustomers
          ? [{ label: "Customers", icon: ContactRound, href: "/customers" }]
          : []),
      ],
    },
    {
      id: "people",
      label: "People",
      items: [
        ...(workspace.canViewEmployees
          ? [{ label: "Employees", icon: UserRound, href: "/employees" }]
          : []),
        ...(workspace.canViewAttendance
          ? [
              {
                label: "Attendance",
                icon: CalendarCheck2,
                href: "/attendance",
              },
              { label: "Leave", icon: CalendarDays, href: "/leave" },
            ]
          : []),
        ...(workspace.canViewPayroll
          ? [{ label: "Payroll", icon: WalletCards, href: "/payroll" }]
          : []),
      ],
    },
    {
      id: "operations",
      label: "Operations",
      items: [
        ...(workspace.canViewPurchasing
          ? [
              { label: "Suppliers", icon: Building2, href: "/suppliers" },
              {
                label: "Purchases",
                icon: ClipboardList,
                href: "/purchases",
              },
            ]
          : []),
        ...(workspace.canViewExpenses
          ? [{ label: "Expenses", icon: Receipt, href: "/expenses" }]
          : []),
        ...(workspace.canViewReports
          ? [
              {
                label: "Operations report",
                icon: TrendingUp,
                href: "/reports/operations",
              },
            ]
          : []),
      ],
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
        ...(workspace.canViewSettings
          ? [
              {
                label: "Business settings",
                icon: Settings,
                href: "/settings/business",
              },
            ]
          : []),
        ...(workspace.canViewAudit
          ? [{ label: "Audit log", icon: History, href: "/audit-log" }]
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
        !pathname.startsWith(`${href}/tags`) &&
        !pathname.startsWith(`${href}/units`)
      );
    if (item.href === "/inventory")
      return (
        pathname === href ||
        pathname.startsWith(`${href}/adjustments`) ||
        pathname.startsWith(`${href}/transfers`)
      );
    if (item.href === "/sales")
      return (
        (pathname === href || pathname.startsWith(`${href}/`)) &&
        pathname !== `${href}/new` &&
        !pathname.startsWith(`${href}/new/`)
      );
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <div
        className={cn(
          "flex h-[72px] items-center gap-3 px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <Link
          href={base}
          className="flex min-w-0 items-center gap-3 rounded-xl"
          aria-label={`${brand.name} dashboard`}
        >
          <span className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-[0_8px_20px_oklch(0.55_0.245_272/0.24)]">
            {brand.logoMark}
          </span>
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">
              {brand.name}
            </span>
          )}
        </Link>
      </div>

      <nav
        className={cn(
          "flex-1 overflow-y-auto px-3 pt-3 pb-2",
          collapsed && "px-2",
        )}
        aria-label="Primary navigation"
      >
        <div className="space-y-2.5">
          {navigationGroups.map((group) => (
            <div key={group.id}>
              {!collapsed && (
                <button
                  type="button"
                  className="text-sidebar-foreground/65 hover:text-sidebar-foreground flex h-7 w-full items-center justify-between rounded-md px-2 text-[9px] font-bold tracking-[0.15em] uppercase transition-colors"
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
                          "text-sidebar-foreground/62 hover:bg-accent hover:text-accent-foreground relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium transition-[color,background-color,box-shadow]",
                          active &&
                            "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-[0_9px_20px_oklch(0.55_0.245_272/0.2)]",
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

      <div className={cn("space-y-2 p-3 pt-2", collapsed && "px-2")}>
        {!collapsed && (
          <SidebarPlanCard
            href={
              workspace.canViewBilling ? `${base}/settings/billing` : undefined
            }
            planName={workspace.planName}
            productCount={workspace.productCount}
            productLimit={workspace.productLimit}
            onNavigate={closeMobile}
          />
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
  const [isSwitchingBusiness, startSwitchingBusiness] = React.useTransition();
  const recentNotifications = workspace.recentNotifications ?? [];
  const notificationUnread = workspace.notificationUnread ?? 0;

  function switchBusiness(targetSlug: string) {
    if (workspace.isDemo || targetSlug === tenantSlug) return;
    startSwitchingBusiness(async () => {
      try {
        const target = await switchBusinessAction(targetSlug);
        router.push(`/app/${target.tenantSlug}`);
      } catch {
        toast.error("We could not switch businesses. Try again.");
      }
    });
  }

  return (
    <div className="bg-background min-h-screen overflow-x-clip">
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="bg-foreground/25 absolute inset-0 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="bg-sidebar text-sidebar-foreground relative flex h-full w-[296px] max-w-[86vw] flex-col rounded-r-2xl shadow-[var(--shadow-float)]">
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
        data-app-frame
        data-app-surface
        className={cn(
          "relative min-h-screen overflow-clip lg:grid",
          collapsed
            ? "lg:grid-cols-[76px_minmax(0,1fr)]"
            : "lg:grid-cols-[252px_minmax(0,1fr)]",
        )}
      >
        <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground relative z-40 hidden h-screen flex-col border-r transition-[width] duration-200 lg:sticky lg:top-0 lg:flex">
          <SidebarContent
            tenantSlug={tenantSlug}
            workspace={workspace}
            collapsed={collapsed}
          />
          <Button
            variant="outline"
            size="icon"
            className="bg-card absolute top-[82px] -right-3.5 size-7 rounded-full shadow-[var(--shadow-float)]"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
        </aside>

        <div className="min-w-0">
          <header className="bg-card/95 border-border/45 sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b px-4 backdrop-blur-xl sm:px-6">
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
            <GlobalSearch tenantSlug={tenantSlug} isDemo={workspace.isDemo} />
            <div className="ml-auto flex items-center">
              <HeaderStoreSwitcher
                activeStoreId={workspace.activeStoreId}
                isDemo={workspace.isDemo}
                storeName={workspace.storeName}
                stores={workspace.stores}
                tenantSlug={tenantSlug}
              />
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="bg-card hidden rounded-full shadow-[var(--shadow-button)] min-[360px]:inline-flex"
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
                className="bg-card hidden rounded-full shadow-[var(--shadow-button)] min-[360px]:inline-flex"
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
                    className="bg-card relative rounded-full shadow-[var(--shadow-button)]"
                    aria-label="Notifications"
                  >
                    <Bell />
                    {notificationUnread > 0 && (
                      <span className="bg-destructive ring-background absolute top-2 right-2 size-1.5 rounded-full ring-2" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {recentNotifications.length === 0 ? (
                    <div className="px-3 py-5 text-center">
                      <p className="text-sm font-medium">
                        You’re all caught up
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        New workspace alerts will appear here.
                      </p>
                    </div>
                  ) : (
                    recentNotifications.map((notification) => (
                      <DropdownMenuItem key={notification.id} asChild>
                        <Link
                          href={
                            notification.href ??
                            `/app/${tenantSlug}/notifications`
                          }
                          className="items-start"
                        >
                          <span
                            className={cn(
                              "mt-1 size-2 shrink-0 rounded-full",
                              notification.severity === "critical"
                                ? "bg-destructive"
                                : notification.severity === "warning"
                                  ? "bg-warning"
                                  : notification.severity === "success"
                                    ? "bg-success"
                                    : "bg-primary",
                              notification.read && "opacity-30",
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {notification.title}
                          </span>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/app/${tenantSlug}/notifications`}>
                      <Bell /> View all notifications
                      {notificationUnread > 0 && (
                        <span className="bg-primary/10 text-primary ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold">
                          {notificationUnread > 99 ? "99+" : notificationUnread}
                        </span>
                      )}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="ml-1 flex items-center gap-2 rounded-full p-0.5 sm:rounded-lg sm:pr-2"
                    aria-label="Open account menu"
                  >
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
                  {workspace.businesses.length > 1 && (
                    <>
                      <DropdownMenuLabel>Switch business</DropdownMenuLabel>
                      {workspace.businesses.map((business) => {
                        const active = business.slug === tenantSlug;
                        return (
                          <DropdownMenuItem
                            key={business.tenantId}
                            onSelect={() => switchBusiness(business.slug)}
                            disabled={isSwitchingBusiness}
                          >
                            <Building2 />
                            <span className="min-w-0 flex-1 truncate">
                              {business.name}
                            </span>
                            {active && <Check className="text-primary" />}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {workspace.canViewSettings && (
                    <DropdownMenuItem asChild>
                      <Link href={`/app/${tenantSlug}/settings/security`}>
                        <UserRound /> Account & security
                      </Link>
                    </DropdownMenuItem>
                  )}
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
          <main className="min-h-[calc(100vh-72px)] min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
