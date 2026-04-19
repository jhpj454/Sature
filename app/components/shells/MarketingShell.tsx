"use client"

import { type ReactNode, useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { AuthMeResponse } from "@/app/lib/auth"

// ─── Design tokens (matches CrmShell) ────────────────────────────────────────
const tokens = {
  bgGradient:
    "radial-gradient(ellipse at 0% 100%, #000000 0%, hsl(220, 15%, 8%) 40%, hsl(220, 10%, 18%) 100%)",
  headerBg: "hsl(220, 12%, 10%)",
  textPrimary: "hsl(0, 0%, 100%)",
  textSecondary: "hsl(0, 0%, 80%)",
  textMuted: "hsl(0, 0%, 50%)",
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity="0.9" />
    </svg>
  )
}

function IconCampaigns() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10.5L8 2l6 8.5H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2 10.5h12v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function IconTemplates() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 5h14" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 8.5h4M4 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M5 14v1M11 14v1M5 15h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function IconAutomations() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 1L3 9.5h5L5.5 15 13 6.5H8L9.5 1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.343 3.343l.707.707M11.95 11.95l.707.707M3.343 12.657l.707-.707M11.95 4.05l.707-.707"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10.5 11L14 8l-3.5-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// ─── Nav definition ───────────────────────────────────────────────────────────
type NavItem = { label: string; href: string; icon: ReactNode; exact?: boolean }

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/marketing", icon: <IconDashboard />, exact: true },
  { label: "Campaigns", href: "/marketing/campaigns", icon: <IconCampaigns /> },
  { label: "Templates", href: "/marketing/templates", icon: <IconTemplates /> },
  { label: "Automations", href: "/marketing/automations", icon: <IconAutomations /> },
]

const settingsNavItem: NavItem = { label: "Settings", href: "/marketing/settings", icon: <IconGear /> }

// ─── NavLink ──────────────────────────────────────────────────────────────────
function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "7px 10px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: 500,
        fontFamily: "var(--font-instrument-sans, sans-serif)",
        textDecoration: "none",
        color: isActive ? tokens.textPrimary : tokens.textMuted,
        background: isActive ? "rgba(255,255,255,0.08)" : "transparent",
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)"
          e.currentTarget.style.color = tokens.textSecondary
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "transparent"
          e.currentTarget.style.color = tokens.textMuted
        }
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
      {item.label}
    </Link>
  )
}

// ─── Logout item ──────────────────────────────────────────────────────────────
function LogoutItem() {
  const [pending, setPending] = useState(false)

  async function handleLogout() {
    setPending(true)
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
      if (res.ok) window.location.href = "/login"
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={pending}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "7px 10px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: 500,
        fontFamily: "var(--font-instrument-sans, sans-serif)",
        color: tokens.textMuted,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background 0.15s, color 0.15s",
        opacity: pending ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.06)"
        e.currentTarget.style.color = tokens.textSecondary
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent"
        e.currentTarget.style.color = tokens.textMuted
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}><IconLogout /></span>
      {pending ? "Signing out…" : "Logout"}
    </button>
  )
}

// ─── Sidebar content ──────────────────────────────────────────────────────────
function SidebarContent({ pathname }: { pathname: string }) {
  return (
    <>
      <div style={{ padding: "20px 16px 32px" }}>
        <Link href="/marketing">
          <img src="/Saturelogowhite.svg" alt="Sature" style={{ height: "24px", display: "block" }} />
        </Link>
      </div>
      <nav style={{ flex: 1, padding: "0 10px", display: "flex", flexDirection: "column", gap: "1px", overflowY: "auto" }}>
        {mainNavItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>
      <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "1px" }}>
        <NavLink item={settingsNavItem} pathname={pathname} />
        <LogoutItem />
      </div>
    </>
  )
}

// ─── MarketingShell ───────────────────────────────────────────────────────────
export function MarketingShell({ user, children }: { user: AuthMeResponse; children: ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  return (
    <div
      style={{
        minHeight: "100vh",
        background: tokens.bgGradient,
        backgroundAttachment: "fixed",
        fontFamily: "var(--font-instrument-sans, sans-serif)",
      }}
    >
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 39 }}
        />
      )}

      {/* Desktop sidebar */}
      <aside
        style={{ position: "fixed", left: 0, top: 0, bottom: 0, width: "220px", background: "transparent", display: "flex", flexDirection: "column", zIndex: 40 }}
        className="hidden md:flex"
      >
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile sidebar */}
      <aside
        style={{
          position: "fixed", left: 0, top: 0, bottom: 0, width: "220px",
          background: "rgba(10,12,20,0.92)", backdropFilter: "blur(16px)",
          display: "flex", flexDirection: "column", zIndex: 40,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s",
        }}
        className="flex md:hidden"
      >
        <SidebarContent pathname={pathname} />
      </aside>

      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }} className="md:ml-[220px] ml-0">
        <header
          style={{
            position: "sticky", top: 0, height: "56px",
            background: `${tokens.headerBg}e8`, backdropFilter: "blur(8px)",
            borderBottom: "none", display: "flex", alignItems: "center",
            gap: "16px", padding: "0 32px", zIndex: 30,
          }}
        >
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex md:hidden"
            style={{ background: "none", border: "none", cursor: "pointer", color: tokens.textSecondary, padding: "4px", borderRadius: "6px", flexShrink: 0 }}
            aria-label="Open navigation"
          >
            <IconMenu />
          </button>
        </header>
        <main style={{ flex: 1, padding: "24px 32px" }}>{children}</main>
      </div>
    </div>
  )
}
