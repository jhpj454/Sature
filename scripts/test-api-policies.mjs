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

async function startDevServer(port) {
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
      throw new Error(`Dev server exited with code ${child.exitCode}\n${logs}`);
    }

    const probe = await fetch(`${baseUrl}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
      return { child, baseUrl };
    }
    await delay(500);
  }

  child.kill("SIGTERM");
  throw new Error(`Dev server startup timeout\n${logs}`);
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

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  return {
    response,
    json: text ? JSON.parse(text) : null,
  };
}

async function countRows(agencyId, sql, params = []) {
  return withAgency(agencyId, async (client) => {
    const result = await client.query(sql, params);
    return Number(result.rows[0].count);
  });
}

async function createAgencyFixture(seed) {
  const agencyRes = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [`API Policies ${seed}`],
  );
  const agencyId = agencyRes.rows[0].id;
  const email = `${seed}@saturate.local`;
  const password = "Pol12345!";
  const hash = await bcrypt.hash(password, 10);

  return withAgency(agencyId, async (client) => {
    const userRes = await client.query(
      `
        INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'API Policies User', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, email, hash],
    );

    const accountRes = await client.query(
      `
        INSERT INTO accounts (agency_id, account_type, account_name, status)
        VALUES ($1, 'commercial', $2, 'client')
        RETURNING id
      `,
      [agencyId, makeId("acct")],
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

    return {
      agencyId,
      email,
      password,
      userId: userRes.rows[0].id,
      accountId: accountRes.rows[0].id,
      carrierId: carrierRes.rows[0].id,
    };
  });
}

async function main() {
  const runId = makeId("pol_api");
  const fixtureA = await createAgencyFixture(`a_${runId}`);
  const fixtureB = await createAgencyFixture(`b_${runId}`);

  const { child, baseUrl } = await startDevServer(3131);

  try {
    const loginA = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: fixtureA.email,
      password: fixtureA.password,
    });
    assert.equal(loginA.response.status, 200);
    const cookieA = loginA.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookieA);

    const loginB = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: fixtureB.email,
      password: fixtureB.password,
    });
    assert.equal(loginB.response.status, 200);
    const cookieB = loginB.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookieB);

    const beforeCreateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'policy.create'",
    );
    const beforeCreateEvents = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'policy.created'",
    );

    const createPolicy = await apiRequest(
      baseUrl,
      "POST",
      "/api/policies",
      {
        account_id: fixtureA.accountId,
        carrier_id: fixtureA.carrierId,
        lob: "GL",
        policy_number: `POL-${runId}`,
        effective_date: "2026-01-01",
        expiration_date: "2026-12-31",
        status: "active",
        billing_type: "agency_bill",
        premium_amount: 1200,
        commission_estimate_amount: 120,
        agency_fee_amount: 10,
        agency_revenue_estimate_amount: 130,
      },
      cookieA,
    );

    assert.equal(createPolicy.response.status, 201);
    const policyId = createPolicy.json.data.id;

    const afterCreateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'policy.create'",
    );
    const afterCreateEvents = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'policy.created'",
    );
    assert.equal(afterCreateAudit, beforeCreateAudit + 1);
    assert.equal(afterCreateEvents, beforeCreateEvents + 1);

    const list = await apiRequest(
      baseUrl,
      "GET",
      "/api/policies?expiring_before=2027-01-01",
      undefined,
      cookieA,
    );
    assert.equal(list.response.status, 200);
    assert.ok(list.json.data.some((row) => row.id === policyId));

    const getById = await apiRequest(baseUrl, "GET", `/api/policies/${policyId}`, undefined, cookieA);
    assert.equal(getById.response.status, 200);
    assert.equal(getById.json.data.id, policyId);

    const beforeUpdateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'policy.update'",
    );

    const patch = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/policies/${policyId}`,
      {
        status: "pending",
      },
      cookieA,
    );
    assert.equal(patch.response.status, 200);
    assert.equal(patch.json.data.status, "pending");

    const afterUpdateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'policy.update'",
    );
    assert.equal(afterUpdateAudit, beforeUpdateAudit + 1);

    const crossGet = await apiRequest(baseUrl, "GET", `/api/policies/${policyId}`, undefined, cookieB);
    assert.equal(crossGet.response.status, 404);

    const crossPatch = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/policies/${policyId}`,
      { status: "canceled" },
      cookieB,
    );
    assert.equal(crossPatch.response.status, 404);

    process.stdout.write("Policies API integration checks passed.\n");
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
