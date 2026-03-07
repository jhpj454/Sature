"use client";

// All new UI must use primitives and follow /styleguide.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { LogoutButton } from "@/app/components/LogoutButton";
import { Button } from "@/app/components/ui/button";
import { Sheet } from "@/app/components/ui/sheet";
import { cn } from "@/app/lib/cn";
import { getNavForRole, type NavItem } from "@/app/lib/navigation";
import type { AppRole } from "@/app/lib/auth";

type AppShellProps = {
  appName: string;
  role: AppRole;
  userName: string;
  userEmail: string;
  showTopBar?: boolean;
  dense?: boolean;
  children: ReactNode;
};

function isNavActive(pathname: string, item: NavItem) {
  if (pathname === item.href) {
    return true;
  }

  if (item.href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(`${item.href}/`);
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = isNavActive(pathname, item);

        return (
          <Link
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function splitNavItems(items: NavItem[]) {
  const settingsItem = items.find((item) => item.label === "Settings");
  const primaryItems = items.filter((item) => item.label !== "Settings");
  return { primaryItems, settingsItem };
}

export function AppShell({
  appName,
  role,
  userName,
  userEmail,
  showTopBar = false,
  dense = false,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navItems = useMemo(() => getNavForRole(role), [role]);
  const { primaryItems, settingsItem } = useMemo(() => splitNavItems(navItems), [navItems]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-zinc-200 bg-white p-5 md:flex md:flex-col">
        <div className="flex h-full flex-col">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{appName}</p>
          <p className="mt-1 text-sm text-zinc-600">{role}</p>
          <div className="mt-6">
            <NavLinks items={primaryItems} pathname={pathname} />
          </div>
          {settingsItem ? (
            <div className="mt-auto border-t border-zinc-200 pt-4">
              <NavLinks items={[settingsItem]} pathname={pathname} />
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <Button
                aria-label="Open navigation menu"
                className="md:hidden"
                onClick={() => setMobileNavOpen(true)}
                size="sm"
                variant="outline"
              >
                ☰
              </Button>

              {showTopBar ? (
                <div>
                  <p className="text-sm text-zinc-500">Signed in as</p>
                  <p className="text-sm font-semibold text-zinc-900">{userName}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-zinc-900">{appName}</p>
                  <p className="text-xs text-zinc-500">{role}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <p className="hidden text-xs text-zinc-500 sm:block">{userEmail}</p>
              <LogoutButton />
            </div>
          </div>
        </header>

        <div className="border-b border-zinc-200 bg-white px-4 py-2 md:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {navItems.map((item) => {
              const active = isNavActive(pathname, item);
              return (
                <Link
                  className={cn(
                    "shrink-0 rounded-md px-2.5 py-1.5 text-xs",
                    active
                      ? "bg-zinc-900 text-white"
                      : "border border-zinc-300 bg-white text-zinc-700",
                  )}
                  href={item.href}
                  key={`mobile-quick-${item.href}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <main className={cn("flex-1 p-4 md:p-6", dense ? "space-y-6" : "space-y-6", dense ? "max-w-7xl" : "max-w-6xl")}>
          {children}
        </main>
      </div>

      <Sheet onClose={() => setMobileNavOpen(false)} open={mobileNavOpen} title={appName}>
        <p className="text-xs text-zinc-500">{role}</p>
        <div className="mt-4">
          <NavLinks
            items={navItems}
            onNavigate={() => setMobileNavOpen(false)}
            pathname={pathname}
          />
        </div>
      </Sheet>
    </div>
  );
}
