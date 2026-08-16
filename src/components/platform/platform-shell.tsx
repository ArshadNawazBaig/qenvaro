"use client";

import {
  Activity,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface PlatformShellProps {
  identity: {
    name: string;
    email: string;
    twoFactorEnabled: boolean;
    sessionAssured: boolean;
  };
  children: React.ReactNode;
}

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "/platform" },
  { label: "Security", icon: ShieldCheck, href: "/platform/security" },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function PlatformNavigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="border-sidebar-border flex h-16 items-center gap-3 border-b px-5">
        <span className="bg-foreground text-background flex size-8 items-center justify-center rounded-lg font-bold">
          {brand.logoMark}
        </span>
        <span>
          <span className="block text-sm font-semibold">{brand.name}</span>
          <span className="text-muted-foreground block text-[11px]">
            Platform control
          </span>
        </span>
      </div>
      <div className="px-4 py-5">
        <Badge variant="outline" className="gap-1.5">
          <ShieldCheck className="size-3" /> Restricted area
        </Badge>
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Platform navigation">
        <p className="text-muted-foreground px-2 pb-2 text-[11px] font-semibold tracking-wider uppercase">
          Control plane
        </p>
        {navigation.map((item) => {
          const active =
            item.href === "/platform"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={cn(
                "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium",
                active && "bg-sidebar-accent text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" /> {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-sidebar-border p-4">
        <div className="bg-muted rounded-lg p-3">
          <p className="flex items-center gap-2 text-xs font-medium">
            <Activity className="text-success-foreground size-3.5" /> Metadata
            boundary
          </p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-4">
            Tenant business records are not available in this shell.
          </p>
        </div>
      </div>
    </>
  );
}

export function PlatformShell({ identity, children }: PlatformShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-40 hidden w-[252px] flex-col border-r lg:flex">
        <PlatformNavigation />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="bg-foreground/30 absolute inset-0 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="bg-sidebar relative flex h-full w-[280px] flex-col border-r shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 z-10"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </Button>
            <PlatformNavigation close={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-[252px]">
        <header className="bg-background/92 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              Platform operations
            </p>
            <p className="text-muted-foreground hidden text-xs sm:block">
              Aggregate service metadata only
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Badge
              variant={
                identity.twoFactorEnabled && identity.sessionAssured
                  ? "success"
                  : "warning"
              }
              className="hidden sm:inline-flex"
            >
              {identity.twoFactorEnabled && identity.sessionAssured
                ? "2FA verified"
                : "2FA required"}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Avatar className="ml-1">
              <AvatarFallback>{initials(identity.name)}</AvatarFallback>
            </Avatar>
            <div className="hidden max-w-40 min-w-0 sm:block">
              <p className="truncate text-xs font-semibold">{identity.name}</p>
              <p className="text-muted-foreground truncate text-[11px]">
                {identity.email}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={async () => {
                await authClient.signOut();
                router.replace("/sign-in");
              }}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
