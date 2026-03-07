# Saturate Backend (Local Dev)

## Prerequisites

- Node 20+
- PostgreSQL running locally
- `.env.local` with `DATABASE_URL=...`

## 1) Install

```bash
npm install
```

## 2) Run migrations

```bash
npm run migrate:up
```

Success looks like:
- each migration printed with `Migrating files: ...`
- no `ERROR` lines

## 3) Seed dev admin

Start dev server:

```bash
npm run dev
```

In another terminal:

```bash
curl -s -X POST http://127.0.0.1:3000/api/seed | jq
```

Seed credentials:
- email: `admin@saturate.local`
- password: `admin123!`

## 4) Login

```bash
curl -i -s -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@saturate.local","password":"admin123!"}'
```

Success looks like:
- `HTTP/1.1 200 OK`
- `Set-Cookie: session_token=...`

## 5) Run tests

RLS isolation:

```bash
npm run test:rls
```

Renewals job and idempotency:

```bash
npm run test:renewals
```

API smoke / write-audit-event checks:

```bash
npm run test:api-smoke
```

Legacy/phase suites:

```bash
npm run test:phase1b:hardening
npm run test:phase1c:renewals
npm run test:policy-transaction-accounting
```

## 6) Run renewals job manually

```bash
npm run jobs:renewals:run
```

## Notes

- Multi-tenant isolation is enforced in Postgres via RLS.
- Tenant context is set per request/transaction using:
  `SELECT set_config('app.current_agency_id', $1, true)`.
- API middleware sets `x-request-id` on every `/api/*` request.
