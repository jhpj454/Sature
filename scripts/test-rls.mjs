import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";

loadDotenv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing in environment.");
}

const RLS_TEST_ROLE = "saturate_rls_test";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TENANT_TABLES = [
  "users",
  "accounts",
  "contacts",
  "contact_roles",
  "carriers",
  "policies",
  "policy_exposures",
  "policy_transactions",
  "transaction_changes",
  "service_cases",
  "tasks",
  "activities",
  "documents",
  "document_links",
  "certificate_holders",
  "certificate_wording_library",
  "coi_requests",
  "claims",
  "events",
  "audit_log",
  "sessions",
  "policy_lines",
  "renewal_rules",
  "job_runs",
  "commission_splits",
  "producer_payouts",
  "producer_payout_items",
];

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

async function initRlsRole() {
  const userRes = await pool.query("SELECT current_user");
  const currentUser = userRes.rows[0].current_user;

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_TEST_ROLE}') THEN
        CREATE ROLE ${RLS_TEST_ROLE} NOLOGIN;
      END IF;
    END
    $$;
  `);

  await pool.query(`GRANT ${RLS_TEST_ROLE} TO ${currentUser}`);
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${RLS_TEST_ROLE}`);
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_TEST_ROLE}`,
  );
}

async function withAgency(agencyId, fn, useRlsRole = false) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (useRlsRole) {
      await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
    }
    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [agencyId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function withNoTenant(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createAgency(name) {
  const res = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [name],
  );
  return res.rows[0].id;
}

async function createActiveUser(agencyId, email, password) {
  const hash = await bcrypt.hash(password, 10);
  return withAgency(agencyId, async (client) => {
    const res = await client.query(
      `
        INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'RLS Test User', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, email, hash],
    );
    return res.rows[0].id;
  });
}

async function verifyTenantTableRls() {
  const tableRows = await pool.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `,
  );
  const existing = new Set(tableRows.rows.map((row) => row.table_name));
  for (const table of TENANT_TABLES) {
    assert.ok(existing.has(table), `Missing expected tenant table: ${table}`);
  }

  const rlsRows = await pool.query(
    `
      SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY($1::text[])
    `,
    [TENANT_TABLES],
  );

  const rlsMap = new Map(rlsRows.rows.map((row) => [row.table_name, row]));
  for (const table of TENANT_TABLES) {
    const row = rlsMap.get(table);
    assert.ok(row, `RLS metadata missing for ${table}`);
    assert.equal(row.relrowsecurity, true, `RLS not enabled for ${table}`);
    assert.equal(row.relforcerowsecurity, true, `FORCE RLS not enabled for ${table}`);
  }

  const policyRows = await pool.query(
    `
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = ANY($1::text[])
    `,
    [TENANT_TABLES],
  );
  const policyMap = new Map();
  for (const row of policyRows.rows) {
    const names = policyMap.get(row.tablename) ?? new Set();
    names.add(row.policyname);
    policyMap.set(row.tablename, names);
  }

  for (const table of TENANT_TABLES) {
    const names = policyMap.get(table) ?? new Set();
    for (const suffix of ["select", "insert", "update", "delete"]) {
      assert.ok(
        names.has(`${table}_${suffix}_policy`),
        `Missing ${suffix} policy on ${table}`,
      );
    }
  }
}

async function main() {
  await initRlsRole();
  await verifyTenantTableRls();

  const runId = makeId("rls");
  const agencyA = await createAgency(`RLS Agency A ${runId}`);
  const agencyB = await createAgency(`RLS Agency B ${runId}`);

  const userA = await createActiveUser(agencyA, `a_${runId}@saturate.local`, "Pass123!");
  await createActiveUser(agencyB, `b_${runId}@saturate.local`, "Pass123!");

  const fixture = await withAgency(agencyA, async (client) => {
    const accountRes = await client.query(
      `
        INSERT INTO accounts (agency_id, account_type, account_name, status)
        VALUES ($1, 'commercial', $2, 'client')
        RETURNING id
      `,
      [agencyA, makeId("acct")],
    );

    const carrierRes = await client.query(
      `
        INSERT INTO carriers (
          agency_id, name, integration_status, metadata, created_by, updated_by
        ) VALUES ($1, $2, 'none', '{}'::jsonb, $3, $3)
        RETURNING id
      `,
      [agencyA, makeId("carrier"), userA],
    );

    const policyRes = await client.query(
      `
        INSERT INTO policies (
          agency_id,
          account_id,
          carrier_id,
          lob,
          policy_number,
          effective_date,
          expiration_date,
          status,
          billing_type,
          premium_amount,
          commission_estimate_amount,
          agency_fee_amount,
          agency_revenue_estimate_amount
        ) VALUES (
          $1, $2, $3, 'gl', $4,
          CURRENT_DATE, CURRENT_DATE + INTERVAL '120 days',
          'active', 'agency_bill',
          1000, 100, 0, 100
        )
        RETURNING id
      `,
      [agencyA, accountRes.rows[0].id, carrierRes.rows[0].id, makeId("policy")],
    );

    const ruleRes = await client.query(
      `
        INSERT INTO renewal_rules (
          agency_id,
          is_enabled,
          days_before_expiration,
          create_case,
          case_priority,
          assign_to,
          metadata,
          created_by,
          updated_by
        ) VALUES ($1, true, 45, true, 'normal', $2, '{}'::jsonb, $2, $2)
        RETURNING id
      `,
      [agencyA, userA],
    );

    return {
      accountId: accountRes.rows[0].id,
      policyId: policyRes.rows[0].id,
      renewalRuleId: ruleRes.rows[0].id,
    };
  });

  await withAgency(
    agencyB,
    async (client) => {
      for (const [table, id] of [
        ["accounts", fixture.accountId],
        ["policies", fixture.policyId],
        ["renewal_rules", fixture.renewalRuleId],
      ]) {
        const readRes = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE id = $1`, [
          id,
        ]);
        assert.equal(Number(readRes.rows[0].count), 0, `cross-tenant read leaked on ${table}`);

        const updateRes = await client.query(`UPDATE ${table} SET updated_at = updated_at WHERE id = $1`, [
          id,
        ]);
        assert.equal(updateRes.rowCount, 0, `cross-tenant update leaked on ${table}`);

        const deleteRes = await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
        assert.equal(deleteRes.rowCount, 0, `cross-tenant delete leaked on ${table}`);
      }
    },
    true,
  );

  for (const [table, id] of [
    ["accounts", fixture.accountId],
    ["policies", fixture.policyId],
    ["renewal_rules", fixture.renewalRuleId],
  ]) {
    await withNoTenant(async (client) => {
      try {
        const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE id = $1`, [id]);
        assert.equal(Number(res.rows[0].count), 0, `no-tenant context should not read ${table}`);
      } catch (error) {
        assert.match(String(error), /invalid input syntax for type uuid/i);
      }
    });
  }

  console.log("RLS integration checks passed.");
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
