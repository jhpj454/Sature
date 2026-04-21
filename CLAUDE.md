# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Living Document Instruction

This file should be continuously updated throughout conversations. Whenever something new is learned — a decision made, a pattern established, a bug fixed, a feature built, a preference expressed — add it to the relevant section of this file. Treat CLAUDE.md as the running knowledge base of this project so that future Claude instances start with full context.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint checks
npm run migrate:up   # Run pending DB migrations
npm run migrate:down # Rollback migrations
npm run migrate:create -- <name>  # Create new migration

# Tests
npm run test:rls               # RLS isolation tests
npm run test:api               # API smoke tests (accounts, policies, AMS)
npm run test:renewals          # Renewals job and idempotency

# Seeding (dev only — requires APP_ENV=development)
npm run seed:dev               # Create demo agency + admin user
```

**Dev setup:**
```bash
# .env.local
DATABASE_URL=postgresql://user@localhost:5432/saturate_dev
SESSION_SECRET=dev-secret-key-change-in-production
APP_ENV=development
```
After `npm run dev`, hit `POST /api/seed` to create demo data. Login: `admin@saturate.local` / `admin123!`

## Architecture

**Stack:** Next.js (App Router), React 19, PostgreSQL (node-pg), TypeScript, Tailwind CSS 4, Zod

### Multi-Tenancy via PostgreSQL RLS

Every request that touches the database goes through `withTenantClientFromRequest()` (`src/server/tenant.ts`). This function:
1. Validates the session cookie and loads the user session
2. Executes `SELECT set_config('app.current_agency_id', agencyId, true)` on the Postgres connection
3. All 23 tenant tables have RLS policies that filter by `agency_id = current_setting('app.current_agency_id')::uuid`

App code also filters by `session.agency_id` as belt-and-suspenders, but the DB layer is the authoritative isolation boundary.

### Auth Flow

Sessions use HTTP-only cookies (`session_token`). The cookie encodes `agency_id:token`. On login, the system searches all active agencies for the email (single sign-on style), verifies bcrypt password, and creates a session row with 7-day TTL.

Role-based routing: `producer` → `/crm`, `csr` → `/ams`, `marketing` → `/marketing`, `admin` → `/admin`. Server components call `requireAuthenticatedUser()` or `requireRole(role)` which redirect on failure.

### API Route Pattern

```typescript
// app/api/[resource]/route.ts
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = MyZodSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '...' }, { status: 400 });

  return withTenantClientFromRequest(request, async (client, session) => {
    // client.query() enforces RLS automatically
    // Always also filter WHERE agency_id = $n for clarity
    await logAudit(client, { agency_id: session.agency_id, ... });
    await emitEvent(client, { ... });
    return NextResponse.json({ ok: true, data: result });
  });
}
```

Every write must call `logAudit()` and `emitEvent()`. The `audit_log` table is immutable (no UPDATE/DELETE policies).

### Domain Model

Core entities: `agencies` (tenants), `users`, `accounts` (customer businesses), `contacts`, `policies`, `policy_exposures`, `policy_transactions`, `service_cases`, `tasks`, `activities`, `documents`, `claims`, `events`, `audit_log`, `sessions`.

Key enums:
- Account status: `prospect | client | lost`
- Policy status: `quoted | active | canceled | expired | pending`
- User role: `producer | csr | marketing | accounting | admin`
- Transaction type: `new_business | endorsement | renewal | cancellation | rewrite | audit`
- Service case type: `endorsement | renewal | coi | claim | billing | cancellation | other`

### Modules

- **`/crm`** — Producer-facing: leads, pipeline, accounts, contacts, tasks, calendar
- **`/ams`** — CSR/operations: policies, service cases, renewals, documents, COI
- **`/admin`** — Agency admin: users, settings, reports
- **`/marketing`** — Campaign management

### Key Server Files

| File | Purpose |
|------|---------|
| `src/server/auth.ts` | Session create/validate, bcrypt, rate limiting |
| `src/server/tenant.ts` | `withTenantClientFromRequest`, RLS setup |
| `src/server/audit.ts` | `logAudit()` — immutable audit trail |
| `src/server/events.ts` | `emitEvent()` — business event emission |
| `src/server/crm.ts` | CRM business logic, pipeline stages |
| `src/server/automation/` | Renewal automation engine |
| `src/server/task-rules-engine.ts` | Recurring task rules with rrule |
| `src/db/index.ts` | `query()`, `withTransaction()` |
| `migrations/` | Ordered schema migrations (node-pg-migrate) |

### UI Conventions

- Dark design system throughout — no light mode
- Tailwind utility classes, no CSS modules
- Server components by default; add `'use client'` only when needed (event handlers, hooks)
- `safeApiFetchJson()` in `app/lib/` for client-side data fetching
- Three shell layouts: `AdminShell`, `AmsShell`, `CrmShell` — wrap all module pages

## Build Progress (2026-04-21)

### Completed — CRM Customers, Tasks, Calendar

**Migration `032_task_rules_and_calendar.js`**: Run and applied. Adds `task_templates`, `task_automation_rules`, `task_rule_executions` tables; extends `tasks` with `template_id`, `rule_id`, `recurrence_rule`, `parent_task_id`; extends `activities` with `end_at`, `all_day`, `location`, `category`, `recurrence_rule`, `parent_activity_id`. All tables have RLS enabled.

**Server libs:**
- `src/server/rrule.ts` — wraps `rrule` npm package; exports `expandRRule()` and `validateRRule()`
- `src/server/task-rules-engine.ts` — exports `evaluateRulesForAgency()` for trigger-based and recurring task automation

**Customers page (`/crm/customers`):**
- `app/crm/customers/page.tsx` — server component; shows Upcoming Renewals panel (60-day window) + full customer list
- `app/crm/customers/_components/CustomersTable.tsx` — client component; search (debounced), filters (type, active policies, producer), inline Create Task modal
- `app/crm/customers/[id]/page.tsx` — customer detail server component
- `app/crm/customers/[id]/CustomerDetailClient.tsx` — 4-tab client: Overview, Contacts, Policies, Tasks
- `app/api/crm/customers/route.ts` — GET list with search/filter/pagination + `?view=renewals`
- `app/api/crm/customers/[id]/route.ts` — GET detail (account + contacts + policies + tasks)
- "Customers" added to `producerNav` in `app/lib/navigation.ts`

**Tasks page (`/crm/tasks`):**
- Full page with My Tasks checklist, Upcoming/Overdue sections, Create Task modal with recurrence
- Manage Templates and Manage Automation Rules sections with full CRUD
- "Run Rules Now" button
- APIs: `/api/crm/tasks/route.ts`, `/api/crm/tasks/[id]/route.ts`, `/api/crm/tasks/[id]/complete/route.ts`, `/api/crm/task-templates/route.ts`, `/api/crm/task-templates/[id]/route.ts`, `/api/crm/task-rules/route.ts`, `/api/crm/task-rules/[id]/route.ts`, `/api/crm/task-rules/run/route.ts`

**Calendar page (`/crm/calendar`):**
- Month view default + Agenda toggle; built with Tailwind + date-fns
- Events stored in `activities` with `category IS NOT NULL`; tasks merged read-only on their `due_date`
- Color-coded pills by category (meeting=blue, call=green, personal=slate, renewal=amber, task=purple, other=gray)
- Create Event modal (summary, category, start, end_at, all_day, location, optional account, recurrence_rule)
- Click event to edit (PATCH) or delete
- APIs: `/api/crm/calendar/route.ts`, `/api/crm/calendar/[id]/route.ts`

**TypeScript / Lint fixes applied:**
- Zod v4: `z.record(z.unknown())` → `z.record(z.string(), z.unknown())` everywhere
- TypeScript union narrowing: `.error` properties now use `?? "fallback"` after `"error" in result` checks
- `<a href>` → `<Link href>` for Next.js internal navigation in customers detail page
- `tsc --noEmit` passes clean; ESLint passes clean on all new/modified source files (worktree artifacts not in scope)
