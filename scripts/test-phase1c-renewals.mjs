import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import bcrypt from "bcrypt";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";

loadDotenv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const RLS_TEST_ROLE = "saturate_rls_test";
let devServerLogs = "";

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

async function withAgency(agencyId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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

async function withAgencyAsRlsRole(agencyId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${RLS_TEST_ROLE}`);
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

async function startDevServer(port) {
  devServerLogs = "";
  const child = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    devServerLogs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    devServerLogs += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    if (child.exitCode !== null) {
      throw new Error(`Dev server exited with code ${child.exitCode}\n${devServerLogs}`);
    }
    const probe = await fetch(`${baseUrl}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
      return { child, baseUrl };
    }
    await delay(500);
  }

  child.kill("SIGTERM");
  throw new Error(`Dev server startup timeout\n${devServerLogs}`);
}

async function stopDevServer(child) {
  if (!child || child.killed) return;
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
  return {
    res,
    json: text ? JSON.parse(text) : null,
  };
}

async function setupFixture(agencyNameSeed, email, password) {
  const agencyRes = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [agencyNameSeed],
  );
  const agencyId = agencyRes.rows[0].id;

  const passwordHash = await bcrypt.hash(password, 10);

  return withAgency(agencyId, async (client) => {
    const userRes = await client.query(
      `
        INSERT INTO users (
          agency_id, email, password_hash, display_name, role, status
        ) VALUES ($1, $2, $3, 'Renewals Admin', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, email, passwordHash],
    );

    const carrierRes = await client.query(
      `
        INSERT INTO carriers (
          agency_id, name, integration_status, metadata, created_by, updated_by
        ) VALUES ($1, $2, 'none', '{}'::jsonb, $3, $3)
        RETURNING id
      `,
      [agencyId, makeId("carrier"), userRes.rows[0].id],
    );

    const accountRes = await client.query(
      `
        INSERT INTO accounts (agency_id, account_type, account_name, status)
        VALUES ($1, 'commercial', $2, 'client')
        RETURNING id
      `,
      [agencyId, makeId("account")],
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
          agency_revenue_estimate_amount,
          csr_id
        ) VALUES (
          $1,
          $2,
          $3,
          'gl',
          $4,
          CURRENT_DATE,
          CURRENT_DATE + INTERVAL '1 day',
          'active',
          'agency_bill',
          1000,
          100,
          0,
          100,
          $5
        )
        RETURNING id, policy_number, expiration_date
      `,
      [agencyId, accountRes.rows[0].id, carrierRes.rows[0].id, makeId("pol"), userRes.rows[0].id],
    );

    return {
      agencyId,
      userId: userRes.rows[0].id,
      policyId: policyRes.rows[0].id,
    };
  });
}

async function countAgencyRows(agencyId, sql, params = []) {
  return withAgency(agencyId, async (client) => {
    const res = await client.query(sql, params);
    return Number(res.rows[0].count);
  });
}

async function main() {
  const runId = makeId("renewals");
  await initRlsTestRole();

  const agencyAEmail = `a_${runId}@saturate.local`;
  const agencyBEmail = `b_${runId}@saturate.local`;
  const password = "Renew123!";

  const fixtureA = await setupFixture(`Renewals A ${runId}`, agencyAEmail, password);
  const fixtureB = await setupFixture(`Renewals B ${runId}`, agencyBEmail, password);

  const { child, baseUrl } = await startDevServer(3120);

  try {
    const loginA = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: agencyAEmail,
      password,
    });
    assert.equal(loginA.res.status, 200);

    const cookieA = loginA.res.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookieA);

    const loginB = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: agencyBEmail,
      password,
    });
    assert.equal(loginB.res.status, 200);

    const cookieB = loginB.res.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookieB);

    const renewalRuleCreatedBefore = await countAgencyRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'renewal_rule.created'",
    );

    const ruleAuditBefore = await countAgencyRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'renewal_rule.create'",
    );

    const createRule = await apiRequest(
      baseUrl,
      "POST",
      "/api/ams/renewal-rules",
      {
        is_enabled: true,
        days_before_expiration: 1,
        create_case: true,
        case_priority: "high",
        assign_to: fixtureA.userId,
        metadata: { source: "test" },
      },
      cookieA,
    );

    assert.equal(
      createRule.res.status,
      201,
      `create rule failed: status=${createRule.res.status} body=${JSON.stringify(createRule.json)} logs=${devServerLogs.slice(-2000)}`,
    );
    const ruleId = createRule.json.data.id;

    const renewalRuleCreatedAfter = await countAgencyRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'renewal_rule.created'",
    );
    assert.equal(renewalRuleCreatedAfter, renewalRuleCreatedBefore + 1);

    const ruleAuditAfter = await countAgencyRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'renewal_rule.create'",
    );
    assert.equal(ruleAuditAfter, ruleAuditBefore + 1);

    const visibleInA = await withAgencyAsRlsRole(fixtureA.agencyId, async (client) => {
      const res = await client.query("SELECT 1 FROM renewal_rules WHERE id = $1", [ruleId]);
      return res.rowCount;
    });
    assert.equal(visibleInA, 1);

    const visibleInB = await withAgencyAsRlsRole(fixtureB.agencyId, async (client) => {
      const res = await client.query("SELECT 1 FROM renewal_rules WHERE id = $1", [ruleId]);
      return res.rowCount;
    });
    assert.equal(visibleInB, 0);

    const generatedBefore = await countAgencyRows(
      fixtureA.agencyId,
      `
        SELECT COUNT(*)::int AS count
        FROM events
        WHERE event_type = 'renewal.case_generated'
          AND meta_json->>'policy_id' = $1
      `,
      [fixtureA.policyId],
    );

    const run1 = await apiRequest(
      baseUrl,
      "POST",
      "/api/admin/jobs/renewals/run",
      { scope: "all" },
      cookieA,
    );
    assert.equal(
      run1.res.status,
      200,
      `first run failed: status=${run1.res.status} body=${JSON.stringify(run1.json)} logs=${devServerLogs.slice(-2000)}`,
    );

    const run2 = await apiRequest(
      baseUrl,
      "POST",
      "/api/admin/jobs/renewals/run",
      { scope: "all" },
      cookieA,
    );
    assert.equal(
      run2.res.status,
      200,
      `second run failed: status=${run2.res.status} body=${JSON.stringify(run2.json)}`,
    );

    const caseCount = await countAgencyRows(
      fixtureA.agencyId,
      `
        SELECT COUNT(*)::int AS count
        FROM service_cases
        WHERE policy_id = $1
          AND dedupe_key IS NOT NULL
          AND deleted_at IS NULL
      `,
      [fixtureA.policyId],
    );
    assert.equal(caseCount, 1);

    const generatedAfter = await countAgencyRows(
      fixtureA.agencyId,
      `
        SELECT COUNT(*)::int AS count
        FROM events
        WHERE event_type = 'renewal.case_generated'
          AND meta_json->>'policy_id' = $1
      `,
      [fixtureA.policyId],
    );
    assert.equal(generatedAfter, generatedBefore + 1);

    const serviceCaseAuditCount = await countAgencyRows(
      fixtureA.agencyId,
      `
        SELECT COUNT(*)::int AS count
        FROM audit_log
        WHERE action = 'service_case.create'
          AND entity_type = 'service_cases'
      `,
    );
    assert.ok(serviceCaseAuditCount >= 1);

    const activityAuditCount = await countAgencyRows(
      fixtureA.agencyId,
      `
        SELECT COUNT(*)::int AS count
        FROM audit_log
        WHERE action = 'activity.create'
          AND entity_type = 'activities'
      `,
    );
    assert.ok(activityAuditCount >= 1);

    const agencyACaseIds = await withAgency(fixtureA.agencyId, async (client) => {
      const res = await client.query(
        `
          SELECT id
          FROM service_cases
          WHERE policy_id = $1
            AND dedupe_key IS NOT NULL
            AND deleted_at IS NULL
        `,
        [fixtureA.policyId],
      );
      return res.rows.map((row) => row.id);
    });

    const agencyACaseVisibleInB = await withAgencyAsRlsRole(fixtureB.agencyId, async (client) => {
      const res = await client.query(
        `
          SELECT COUNT(*)::int AS count
          FROM service_cases
          WHERE id = ANY($1::uuid[])
        `,
        [agencyACaseIds],
      );
      return Number(res.rows[0].count);
    });
    assert.equal(agencyACaseVisibleInB, 0, "Agency B should not see Agency A renewal cases.");

    process.stdout.write("Phase 1C Step 4 renewals test passed.\n");
  } finally {
    await stopDevServer(child);
    await pool.end();
  }
}

main().catch(async (error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
