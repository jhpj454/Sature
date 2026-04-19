"use client"

import { type ReactNode, useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

// ─── Design tokens ───────────────────────────────────────────────────────────
const tokens = {
  bgGradient:
    "radial-gradient(ellipse at 0% 100%, #000000 0%, hsl(220, 15%, 8%) 40%, hsl(220, 10%, 18%) 100%)",
  sidebar: "hsl(220, 12%, 8%)",
  sidebarBorder: "rgba(255,255,255,0.08)",
  headerBg: "hsl(220, 12%, 10%)",
  inputBg: "hsl(220, 8%, 24%)",
  inputBorder: "rgba(255,255,255,0.12)",
  hover: "hsl(220, 6%, 32%)",
  accent: "#3762e3",
  textPrimary: "hsl(0, 0%, 100%)",
  textSecondary: "hsl(0, 0%, 80%)",
  textMuted: "hsl(0, 0%, 50%)",
}

// ─── Inline SVG icons (16×16) ─────────────────────────────────────────────────
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

function IconTrophy() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 11c-2.761 0-5-2.239-5-5V2h10v4c0 2.761-2.239 5-5 5z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M3 3H1.5A1.5 1.5 0 0 0 0 4.5v.5a3 3 0 0 0 3 3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M13 3h1.5A1.5 1.5 0 0 1 16 4.5v.5a3 3 0 0 1-3 3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 11v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 15h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconPeople() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M1 13.5C1 11.015 3.239 9 6 9s5 2.015 5 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M13 9.5c1.657.5 2.8 1.9 2.8 3.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 8l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2.5" width="14" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1 6.5h14" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="4" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="7" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
      <rect x="10" y="9" width="2" height="2" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function IconLightning() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.5 1L3 9.5h5L5.5 15 13 6.5H8L9.5 1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
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

function IconMenu() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ─── Nav definition ───────────────────────────────────────────────────────────
type NavItem = {
  label: string
  href: string
  icon: ReactNode
  exact?: boolean
}

const mainNavItems: NavItem[] = [
  { label: "Dashboard", href: "/crm", icon: <IconDashboard />, exact: true },
  { label: "Win Deals", href: "/crm/win-deals", icon: <IconTrophy /> },
  { label: "Customers", href: "/crm/accounts", icon: <IconPeople /> },
  { label: "Tasks", href: "/crm/tasks", icon: <IconCheck /> },
  { label: "Calendar", href: "/crm/calendar", icon: <IconCalendar /> },
  { label: "Leads", href: "/crm/leads", icon: <IconLightning /> },
]

const settingsNavItem: NavItem = {
  label: "Settings",
  href: "/crm/settings",
  icon: <IconGear />,
}

// ─── Search result types ──────────────────────────────────────────────────────
type SearchResult = {
  id: string
  label: string
  href: string
}

type SearchResults = {
  leads?: SearchResult[]
  customers?: SearchResult[]
  pipelines?: SearchResult[]
}

// ─── NavLink component ────────────────────────────────────────────────────────
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

// ─── Logout item ─────────────────────────────────────────────────────────────
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

// ─── Main CrmShell component ──────────────────────────────────────────────────
export function CrmShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search fetch
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSearchResults(null)
      setSearchOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/crm/search?q=${encodeURIComponent(value)}`)
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data)
          setSearchOpen(true)
        }
      } catch {
        // silently fail
      }
    }, 300)
  }, [])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  const hasResults =
    searchResults &&
    ((searchResults.leads?.length ?? 0) > 0 ||
      (searchResults.customers?.length ?? 0) > 0 ||
      (searchResults.pipelines?.length ?? 0) > 0)

  return (
    <div
      style={{
        minHeight: "100vh",
        background: tokens.bgGradient,
        backgroundAttachment: "fixed",
        fontFamily: "var(--font-instrument-sans, sans-serif)",
      }}
    >
      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 39,
          }}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "220px",
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          zIndex: 40,
          transform: sidebarOpen ? "translateX(0)" : undefined,
          transition: "transform 0.2s",
        }}
        className="hidden md:flex"
      >
        {/* Logo */}
        <div style={{ padding: "20px 16px 32px" }}>
          <Link href="/crm">
            <img
              src="/Saturelogowhite.svg"
              alt="Sature"
              style={{ height: "24px", display: "block" }}
            />
          </Link>
        </div>

        {/* Main nav */}
        <nav
          style={{
            flex: 1,
            padding: "0 10px",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            overflowY: "auto",
          }}
        >
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* Bottom-pinned settings + logout */}
        <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "1px" }}>
          <NavLink item={settingsNavItem} pathname={pathname} />
          <LogoutItem />
        </div>
      </aside>

      {/* ── Mobile sidebar (slide-in) ── */}
      <aside
        style={{
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "220px",
          background: "rgba(10,12,20,0.92)",
          backdropFilter: "blur(16px)",
          display: "flex",
          flexDirection: "column",
          zIndex: 40,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.2s",
        }}
        className="flex md:hidden"
      >
        <div style={{ padding: "20px 16px 32px" }}>
          <Link href="/crm">
            <img
              src="/Saturelogowhite.svg"
              alt="Sature"
              style={{ height: "24px", display: "block" }}
            />
          </Link>
        </div>
        <nav
          style={{
            flex: 1,
            padding: "0 10px",
            display: "flex",
            flexDirection: "column",
            gap: "1px",
            overflowY: "auto",
          }}
        >
          {mainNavItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "1px" }}>
          <NavLink item={settingsNavItem} pathname={pathname} />
          <LogoutItem />
        </div>
      </aside>

      {/* ── Right-side content (header + main) ── */}
      <div
        style={{
          marginLeft: "220px",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
        className="md:ml-[220px] ml-0"
      >
        {/* ── Top header bar ── */}
        <header
          style={{
            position: "sticky",
            top: 0,
            height: "56px",
            background: `${tokens.headerBg}e8`,
            backdropFilter: "blur(8px)",
            borderBottom: "none",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            padding: "0 24px",
            zIndex: 30,
          }}
        >
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex md:hidden"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: tokens.textSecondary,
              padding: "4px",
              borderRadius: "6px",
              flexShrink: 0,
            }}
            aria-label="Open navigation"
          >
            <IconMenu />
          </button>

          {/* Search bar */}
          <div
            ref={searchRef}
            style={{
              maxWidth: "512px",
              position: "relative",
            }}
          >
            <div style={{ position: "relative" }}>
              <span
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: tokens.textMuted,
                  display: "flex",
                  pointerEvents: "none",
                }}
              >
                <IconSearch />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => {
                  if (searchQuery.trim() && hasResults) setSearchOpen(true)
                }}
                placeholder="Search leads, customers, pipelines..."
                style={{
                  width: "100%",
                  background: tokens.inputBg,
                  border: `1px solid ${tokens.inputBorder}`,
                  borderRadius: "8px",
                  padding: "8px 12px 8px 36px",
                  fontSize: "14px",
                  color: tokens.textPrimary,
                  fontFamily: "var(--font-instrument-sans, sans-serif)",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                onFocusCapture={(e) => {
                  e.currentTarget.style.borderColor = tokens.accent
                }}
                onBlurCapture={(e) => {
                  e.currentTarget.style.borderColor = tokens.inputBorder
                }}
              />
            </div>

            {/* Search dropdown */}
            {searchOpen && searchQuery.trim() && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "rgba(30, 35, 50, 0.95)",
                  backdropFilter: "blur(12px)",
                  border: `1px solid rgba(255,255,255,0.08)`,
                  borderRadius: "12px",
                  boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                  zIndex: 50,
                }}
              >
                {!hasResults ? (
                  <div
                    style={{
                      padding: "16px",
                      color: tokens.textMuted,
                      fontSize: "13px",
                      textAlign: "center",
                      fontFamily: "var(--font-instrument-sans, sans-serif)",
                    }}
                  >
                    No results found
                  </div>
                ) : (
                  <>
                    {(searchResults?.leads?.length ?? 0) > 0 && (
                      <SearchSection
                        label="Leads"
                        items={searchResults!.leads!}
                        onSelect={() => setSearchOpen(false)}
                      />
                    )}
                    {(searchResults?.customers?.length ?? 0) > 0 && (
                      <SearchSection
                        label="Customers"
                        items={searchResults!.customers!}
                        onSelect={() => setSearchOpen(false)}
                      />
                    )}
                    {(searchResults?.pipelines?.length ?? 0) > 0 && (
                      <SearchSection
                        label="Pipelines"
                        items={searchResults!.pipelines!}
                        onSelect={() => setSearchOpen(false)}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {/* ── Main content ── */}
        <main style={{ flex: 1, padding: "24px 32px" }}>
          {children}
        </main>
      </div>
    </div>
  )
}

// ─── Search dropdown section ──────────────────────────────────────────────────
function SearchSection({
  label,
  items,
  onSelect,
}: {
  label: string
  items: SearchResult[]
  onSelect: () => void
}) {
  return (
    <div>
      <div
        style={{
          padding: "8px 12px 4px",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: tokens.textMuted,
          fontFamily: "var(--font-instrument-sans, sans-serif)",
        }}
      >
        {label}
      </div>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          onClick={onSelect}
          style={{
            display: "block",
            padding: "8px 12px",
            fontSize: "14px",
            color: tokens.textSecondary,
            textDecoration: "none",
            fontFamily: "var(--font-instrument-sans, sans-serif)",
            transition: "background 0.1s, color 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = tokens.inputBg
            e.currentTarget.style.color = tokens.textPrimary
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent"
            e.currentTarget.style.color = tokens.textSecondary
          }}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
