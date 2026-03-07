import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import bcrypt from "bcrypt";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";

loadDotenv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing in environment.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RLS_TEST_ROLE = "saturate_rls_test";

async function withAgency(agencyId, fn, options = {}) {
  const { useRlsRole = false } = options;
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

async function initRlsTestRole() {
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

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
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

async function createUser(agencyId, email, password) {
  const passwordHash = await bcrypt.hash(password, 10);
  return withAgency(agencyId, async (client) => {
    const res = await client.query(
      `
        INSERT INTO users (
          agency_id,
          email,
          password_hash,
          display_name,
          role,
          status
        ) VALUES ($1, $2, $3, 'Hardening User', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, email.toLowerCase(), passwordHash],
    );
    return res.rows[0].id;
  });
}

async function seedAgencyFixture(agencyId, userId) {
  return withAgency(agencyId, async (client) => {
    const carrier = await client.query(
      `
        INSERT INTO carriers (
          agency_id, name, integration_status, metadata, created_by, updated_by
        ) VALUES ($1, $2, 'none', '{}'::jsonb, $3, $3)
        RETURNING id
      `,
      [agencyId, makeId("carrier"), userId],
    );

    const contact = await client.query(
      `
        INSERT INTO contacts (
          agency_id, contact_type, first_name, email, address, tags, status, metadata, created_by, updated_by
        ) VALUES ($1, 'person', 'Alice', $2, '{}'::jsonb, '{}'::text[], 'active', '{}'::jsonb, $3, $3)
        RETURNING id
      `,
      [agencyId, `${makeId("contact")}@local.test`, userId],
    );

    const account = await client.query(
      `
        INSERT INTO accounts (agency_id, account_type, account_name, status)
        VALUES ($1, 'commercial', $2, 'client')
        RETURNING id
      `,
      [agencyId, makeId("account")],
    );

    const policy = await client.query(
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
          CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', 'active', 'agency_bill',
          1000, 100, 10, 110
        )
        RETURNING id
      `,
      [agencyId, account.rows[0].id, carrier.rows[0].id, makeId("pol")],
    );

    const serviceCase = await client.query(
      `
        INSERT INTO service_cases (
          agency_id, case_type, status, priority, account_id, policy_id, title
        ) VALUES ($1, 'renewal', 'open', 'normal', $2, $3, $4)
        RETURNING id
      `,
      [agencyId, account.rows[0].id, policy.rows[0].id, makeId("svc")],
    );

    const transaction = await client.query(
      `
        INSERT INTO policy_transactions (
          agency_id,
          policy_id,
          transaction_type,
          transaction_date,
          status,
          source,
          memo,
          data,
          commission_delta,
          cash_delta,
          revenue_event,
          created_by,
          updated_by
        ) VALUES (
          $1, $2, 'endorsement', CURRENT_DATE, 'pending', 'manual',
          'seed tx', '{}'::jsonb, 0, 0, 'none', $3, $3
        )
        RETURNING id
      `,
      [agencyId, policy.rows[0].id, userId],
    );

    const policyLine = await client.query(
      `
        INSERT INTO policy_lines (
          agency_id,
          policy_transaction_id,
          line_type,
          limits,
          deductibles,
          exposures,
          metadata,
          created_by,
          updated_by
        ) VALUES (
          $1, $2, 'gl', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, $3, $3
        )
        RETURNING id
      `,
      [agencyId, transaction.rows[0].id, userId],
    );

    const contactRole = await client.query(
      `
        INSERT INTO contact_roles (
          agency_id,
          contact_id,
          entity_type,
          entity_id,
          role,
          is_primary,
          metadata,
          created_by,
          updated_by
        ) VALUES ($1, $2, 'policy', $3, 'insured', true, '{}'::jsonb, $4, $4)
        RETURNING id
      `,
      [agencyId, contact.rows[0].id, policy.rows[0].id, userId],
    );

    const activity = await client.query(
      `
        INSERT INTO activities (
          agency_id,
          entity_type,
          entity_id,
          activity_type,
          occurred_at,
          summary,
          details,
          created_by,
          updated_by
        ) VALUES ($1, 'policy', $2, 'system', now(), 'seed activity', '{}'::jsonb, $3, $3)
        RETURNING id
      `,
      [agencyId, policy.rows[0].id, userId],
    );

    const document = await client.query(
      `
        INSERT INTO documents (
          agency_id,
          entity_type,
          entity_id,
          file_name,
          mime_type,
          storage_key,
          tags,
          metadata,
          created_by,
          updated_by
        ) VALUES ($1, 'policy', $2, 'seed.pdf', 'application/pdf', $3, '{}'::text[], '{}'::jsonb, $4, $4)
        RETURNING id
      `,
      [agencyId, policy.rows[0].id, makeId("storage"), userId],
    );

    return {
      carrierId: carrier.rows[0].id,
      contactId: contact.rows[0].id,
      contactRoleId: contactRole.rows[0].id,
      policyId: policy.rows[0].id,
      transactionId: transaction.rows[0].id,
      policyLineId: policyLine.rows[0].id,
      activityId: activity.rows[0].id,
      documentId: document.rows[0].id,
      serviceCaseId: serviceCase.rows[0].id,
    };
  });
}

async function countAudit(action, agencyId) {
  return withAgency(agencyId, async (client) => {
    const res = await client.query(
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = $1",
      [action],
    );
    return Number(res.rows[0].count);
  });
}

async function countEvent(eventType, agencyId) {
  return withAgency(agencyId, async (client) => {
    const res = await client.query(
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = $1",
      [eventType],
    );
    return Number(res.rows[0].count);
  });
}

async function expectAuditAndEvent({ agencyId, action, eventType, call }) {
  const beforeAudit = await countAudit(action, agencyId);
  const beforeEvent = await countEvent(eventType, agencyId);
  await call();
  const afterAudit = await countAudit(action, agencyId);
  const afterEvent = await countEvent(eventType, agencyId);
  assert.equal(afterAudit, beforeAudit + 1, `Expected audit action ${action}`);
  assert.equal(afterEvent, beforeEvent + 1, `Expected event ${eventType}`);
}

async function startDevServer(port) {
  const preconfiguredBaseUrl = process.env.TEST_BASE_URL;
  if (preconfiguredBaseUrl) {
    const probe = await fetch(`${preconfiguredBaseUrl}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
      return { child: null, baseUrl: preconfiguredBaseUrl };
    }
    throw new Error(`TEST_BASE_URL is not reachable: ${preconfiguredBaseUrl}`);
  }

  for (const candidate of ["http://127.0.0.1:3000", `http://127.0.0.1:${port}`]) {
    const probe = await fetch(`${candidate}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
      return { child: null, baseUrl: candidate };
    }
  }

  let logs = "";
  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited early with code ${child.exitCode}\\n${logs}`);
    }
    try {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      if (res.status === 401 || res.status === 200) {
        return { child, baseUrl };
      }
    } catch {
      // ignore until ready
    }
    await delay(500);
  }

  child.kill("SIGTERM");
  throw new Error(`Dev server failed to start in time\\n${logs}`);
}

async function stopDevServer(child) {
  if (!child) return;
  if (child.killed) return;
  child.kill("SIGTERM");
  await delay(500);
  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

async function apiRequest(baseUrl, method, path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  return { res, json };
}

async function main() {
  await initRlsTestRole();

  const runId = makeId("hardening");
  const agencyA = await createAgency(`Hardening A ${runId}`);
  const agencyB = await createAgency(`Hardening B ${runId}`);

  const password = "Admin123!";
  const emailA = `admin_a_${runId}@saturate.local`;
  const emailB = `admin_b_${runId}@saturate.local`;

  const userA = await createUser(agencyA, emailA, password);
  await createUser(agencyB, emailB, password);

  const fixtureA = await seedAgencyFixture(agencyA, userA);

  const rlsTargets = [
    ["carriers", fixtureA.carrierId],
    ["contacts", fixtureA.contactId],
    ["contact_roles", fixtureA.contactRoleId],
    ["policy_transactions", fixtureA.transactionId],
    ["policy_lines", fixtureA.policyLineId],
    ["activities", fixtureA.activityId],
    ["documents", fixtureA.documentId],
    ["policies", fixtureA.policyId],
    ["service_cases", fixtureA.serviceCaseId],
  ];

  await withAgency(agencyB, async (client) => {
    for (const [table, id] of rlsTargets) {
      const readRes = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE id = $1`, [
        id,
      ]);
      assert.equal(Number(readRes.rows[0].count), 0, `RLS read isolation failed for ${table}`);

      const updateRes = await client.query(`UPDATE ${table} SET updated_at = updated_at WHERE id = $1`, [
        id,
      ]);
      assert.equal(updateRes.rowCount, 0, `RLS update isolation failed for ${table}`);

      const deleteRes = await client.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      assert.equal(deleteRes.rowCount, 0, `RLS delete isolation failed for ${table}`);
    }
  }, { useRlsRole: true });

  for (const [table, id] of rlsTargets) {
    await withNoTenant(async (client) => {
      try {
        const res = await client.query(`SELECT COUNT(*)::int AS count FROM ${table} WHERE id = $1`, [
          id,
        ]);
        assert.equal(Number(res.rows[0].count), 0, `No-tenant context should not read ${table}`);
      } catch (error) {
        assert.match(String(error), /invalid input syntax for type uuid/i);
      }
    });
  }

  await assert.rejects(
    withNoTenant(async (client) => {
      await client.query("SELECT set_config('app.current_agency_id', '', true)");
      await client.query("SELECT COUNT(*) FROM carriers");
    }),
    /invalid input syntax for type uuid/i,
  );

  const port = 3107;
  const { child, baseUrl } = await startDevServer(port);

  try {
    const login = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: emailA,
      password,
    });
    assert.equal(login.res.status, 200, "Login failed");
    const setCookie = login.res.headers.get("set-cookie");
    assert.ok(setCookie, "Missing login cookie");
    const cookie = setCookie.split(";")[0];

    await expectAuditAndEvent({
      agencyId: agencyA,
      action: "carrier.create",
      eventType: "carrier.created",
      call: async () => {
        const resp = await apiRequest(baseUrl, "POST", "/api/ams/carriers", {
          agency_id: agencyB,
          name: makeId("api-carrier"),
          integration_status: "none",
          metadata: {},
        }, cookie);
        assert.equal(resp.res.status, 201);
        assert.equal(resp.json.data.agency_id, agencyA);
      },
    });

    await expectAuditAndEvent({
      agencyId: agencyA,
      action: "contact.create",
      eventType: "contact.created",
      call: async () => {
        const resp = await apiRequest(baseUrl, "POST", "/api/ams/contacts", {
          agency_id: agencyB,
          contact_type: "person",
          first_name: "API",
          email: `${makeId("contact")}.local@test.local`,
        }, cookie);
        assert.equal(resp.res.status, 201);
        assert.equal(resp.json.data.agency_id, agencyA);
      },
    });

    await expectAuditAndEvent({
      agencyId: agencyA,
      action: "document.create",
      eventType: "document.created",
      call: async () => {
        const resp = await apiRequest(baseUrl, "POST", "/api/ams/documents", {
          agency_id: agencyB,
          entity_type: "policy",
          entity_id: fixtureA.policyId,
          file_name: "hardening.pdf",
          mime_type: "application/pdf",
          storage_key: makeId("doc-key"),
          metadata: {},
        }, cookie);
        assert.equal(resp.res.status, 201);
        assert.equal(resp.json.data.document.agency_id, agencyA);
      },
    });

    await expectAuditAndEvent({
      agencyId: agencyA,
      action: "activity.create",
      eventType: "activity.created",
      call: async () => {
        const resp = await apiRequest(baseUrl, "POST", "/api/ams/activities", {
          agency_id: agencyB,
          entity_type: "policy",
          entity_id: fixtureA.policyId,
          activity_type: "note",
          summary: "Hardening activity",
          details: {},
        }, cookie);
        assert.equal(resp.res.status, 201);
        assert.equal(resp.json.data.agency_id, agencyA);
      },
    });

    await expectAuditAndEvent({
      agencyId: agencyA,
      action: "policy_transaction.create",
      eventType: "policy_transaction.created",
      call: async () => {
        const resp = await apiRequest(
          baseUrl,
          "POST",
          `/api/ams/policies/${fixtureA.policyId}/transactions`,
          {
            agency_id: agencyB,
            transaction_type: "endorsement",
            transaction_date: "2026-03-01",
            status: "pending",
            source: "manual",
            memo: "Hardening tx",
            data: {},
            commission_delta: 0,
            cash_delta: 0,
            revenue_event: "none",
          },
          cookie,
        );
        assert.equal(resp.res.status, 201);
        assert.equal(resp.json.data.transaction.agency_id, agencyA);
      },
    });

    const beforeRenewalTouched = await countEvent("renewal.touched", agencyA);
    const beforePolicyUpdated = await countEvent("policy.updated", agencyA);
    const beforeRenewalAudit = await countAudit("renewal.touch", agencyA);

    const renewalResp = await apiRequest(
      baseUrl,
      "POST",
      `/api/ams/policies/${fixtureA.policyId}/renewal/touch`,
      {
        agency_id: agencyB,
        renewal_status: "in_progress",
      },
      cookie,
    );
    assert.equal(renewalResp.res.status, 200);

    const afterRenewalTouched = await countEvent("renewal.touched", agencyA);
    const afterPolicyUpdated = await countEvent("policy.updated", agencyA);
    const afterRenewalAudit = await countAudit("renewal.touch", agencyA);

    assert.equal(afterRenewalAudit, beforeRenewalAudit + 1);
    assert.equal(afterRenewalTouched, beforeRenewalTouched + 1);
    assert.equal(afterPolicyUpdated, beforePolicyUpdated + 1);
  } finally {
    await stopDevServer(child);
  }

  await pool.end();
  console.log("Phase 1B hardening integration checks passed.");
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
