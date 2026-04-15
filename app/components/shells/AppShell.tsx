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
  if (pathname === item.href) return true;
  if (item.href === "/") return pathname === "/";
  // Root dashboard paths (e.g. /ams, /crm) are single-segment — only exact match applies.
  // Multi-segment section paths (e.g. /ams/accounts) also highlight on sub-pages.
  const segments = item.href.split("/").filter(Boolean);
  if (segments.length < 2) return false;
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
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active = isNavActive(pathname, item);

        return (
          <Link
            className={cn(
              "block rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
              active
                ? "bg-white/60 dark:bg-white/[0.10] text-slate-900 dark:text-[#e8eaf0] shadow-sm"
                : "text-slate-500 dark:text-[#7b8494] hover:bg-white/30 dark:hover:bg-white/[0.06] hover:text-slate-800 dark:hover:text-[#c8cdd8]",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
            style={active ? { boxShadow: "0 1px 3px rgba(0,0,0,0.06)" } : undefined}
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
    <div className="shell-frost-base min-h-screen text-slate-800 dark:text-[#9da5b4]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] p-5 md:flex md:flex-col">
        <div className="flex h-full flex-col">
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 dark:text-[#9da5b4]">{appName}</p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-[#9da5b4]">{role}</p>
          </div>
          <div className="flex-1">
            <NavLinks items={primaryItems} pathname={pathname} />
          </div>
          {settingsItem ? (
            <div className="border-t border-white/15 dark:border-white/8 pt-3">
              <NavLinks items={[settingsItem]} pathname={pathname} />
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col md:pl-[240px]">
        <header className="sticky top-0 z-20 bg-[rgba(248,251,255,0.38)] dark:bg-[rgba(20,21,26,0.72)] backdrop-blur-2xl">
          <div className="flex items-center justify-between px-5 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <Button
                aria-label="Open navigation menu"
                className="md:hidden"
                onClick={() => setMobileNavOpen(true)}
                size="sm"
                variant="ghost"
              >
                ☰
              </Button>

              {showTopBar ? (
                <div>
                  <p className="text-xs text-slate-400 dark:text-[#9da5b4]">Signed in as</p>
                  <p className="text-sm font-semibold text-slate-800 dark:text-[#e8eaf0]">{userName}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-[#e8eaf0]">{appName}</p>
                  <p className="text-xs text-slate-400 dark:text-[#9da5b4]">{role}</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <p className="hidden text-xs text-slate-400 dark:text-[#9da5b4] sm:block">{userEmail}</p>
              <LogoutButton />
            </div>
          </div>
        </header>

        <div className="bg-[rgba(248,251,255,0.38)] dark:bg-[rgba(20,21,26,0.72)] px-4 py-2 backdrop-blur-2xl md:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {navItems.map((item) => {
              const active = isNavActive(pathname, item);
              return (
                <Link
                  className={cn(
                    "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all",
                    active
                      ? "bg-white/60 dark:bg-white/[0.10] text-slate-900 dark:text-[#e8eaf0] shadow-sm"
                      : "text-slate-500 dark:text-[#7b8494] hover:bg-white/30 dark:hover:bg-white/[0.06]",
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

        <main className={cn("flex-1 p-4 md:p-5", dense ? "max-w-7xl" : "max-w-6xl")}>
          <div className="glass-card p-5 md:p-7">
            {children}
          </div>
        </main>
      </div>

      <Sheet onClose={() => setMobileNavOpen(false)} open={mobileNavOpen} title={appName}>
        <p className="text-xs text-slate-400 dark:text-[#9da5b4]">{role}</p>
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
