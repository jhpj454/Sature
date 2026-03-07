import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";
import { Pool } from "pg";

loadDotenv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing.");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CSR_EMAIL = "csr@saturate.dev";
const CSR_PASSWORD = "SaturateDev123!";

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

async function ensureCsrPolicyFixture() {
  const userRes = await pool.query(
    `
      SELECT id, agency_id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [CSR_EMAIL],
  );

  if (userRes.rowCount === 0) {
    throw new Error(`Missing ${CSR_EMAIL}. Run: npm run seed:dev`);
  }

  const csrUserId = userRes.rows[0].id;
  const agencyId = userRes.rows[0].agency_id;

  await withAgency(agencyId, async (client) => {
    const accountRes = await client.query(
      `
        INSERT INTO accounts (agency_id, account_type, account_name, status, assigned_csr_id)
        VALUES ($1, 'commercial', $2, 'client', $3)
        RETURNING id
      `,
      [agencyId, makeId("ams_policy_acct"), csrUserId],
    );

    const carrierRes = await client.query(
      `
        INSERT INTO carriers (
          agency_id, name, integration_status, metadata, created_by, updated_by
        )
        VALUES ($1, $2, 'none', '{}'::jsonb, $3, $3)
        RETURNING id
      `,
      [agencyId, makeId("ams_policy_carrier"), csrUserId],
    );

    await client.query(
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
          assigned_csr_id,
          csr_id
        )
        VALUES (
          $1, $2, $3, 'GL', $4, '2026-01-01', '2026-12-31',
          'pending', 'agency_bill', 1200, 120, 10, 130, $5, $5
        )
      `,
      [agencyId, accountRes.rows[0].id, carrierRes.rows[0].id, makeId("ams_pol"), csrUserId],
    );
  });
}

async function main() {
  await ensureCsrPolicyFixture();
  const { child, baseUrl } = await startDevServer(3136);

  try {
    const login = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email: CSR_EMAIL,
      password: CSR_PASSWORD,
    });

    assert.equal(login.response.status, 200, "CSR login failed");
    const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie, "Missing session cookie after CSR login");

    const renewals = await apiRequest(
      baseUrl,
      "GET",
      "/api/ams/renewals/snapshot",
      undefined,
      cookie,
    );
    assert.equal(renewals.response.status, 200);
    assert.ok(Array.isArray(renewals.json?.data));
    assert.ok(renewals.json.data.length > 0, "Expected renewals snapshot policies > 0");

    const policies = await apiRequest(
      baseUrl,
      "GET",
      "/api/ams/policies?page_size=100",
      undefined,
      cookie,
    );
    assert.equal(policies.response.status, 200);
    assert.ok(Array.isArray(policies.json?.data));
    assert.ok((policies.json?.pagination?.total ?? 0) > 0, "Expected ams policies total > 0");

    const renewalIds = new Set(renewals.json.data.map((row) => row.id));
    const policyIds = new Set(policies.json.data.map((row) => row.id));
    const intersectionCount = [...renewalIds].filter((id) => policyIds.has(id)).length;
    assert.ok(intersectionCount > 0, "Expected renewals/policies intersection > 0");

    const assignedToMe = await apiRequest(
      baseUrl,
      "GET",
      "/api/ams/policies?assigned_to=me&page_size=100",
      undefined,
      cookie,
    );
    assert.equal(assignedToMe.response.status, 200);

    process.stdout.write("AMS policies parity checks passed.\n");
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
