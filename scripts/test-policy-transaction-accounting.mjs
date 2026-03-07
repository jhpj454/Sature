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
  const preconfiguredBaseUrl = process.env.TEST_BASE_URL;
  if (preconfiguredBaseUrl) {
    const probe = await fetch(`${preconfiguredBaseUrl}/api/auth/me`).catch(() => null);
    if (probe && (probe.status === 401 || probe.status === 200)) {
      return { child: null, baseUrl: preconfiguredBaseUrl };
    }
    throw new Error(`TEST_BASE_URL not reachable: ${preconfiguredBaseUrl}`);
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
  return { res, json: text ? JSON.parse(text) : null };
}

async function countEvents(agencyId, type) {
  return withAgency(agencyId, async (client) => {
    const res = await client.query(
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = $1",
      [type],
    );
    return Number(res.rows[0].count);
  });
}

async function fetchPolicy(agencyId, policyId) {
  return withAgency(agencyId, async (client) => {
    const res = await client.query(
      `
        SELECT id, commission_expected, commission_received, last_transaction_id, revenue_status
        FROM policies
        WHERE id = $1
      `,
      [policyId],
    );
    return res.rows[0];
  });
}

async function main() {
  const runId = makeId("acct");

  const agencyRes = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [`Accounting Agency ${runId}`],
  );
  const agencyId = agencyRes.rows[0].id;

  const password = "Acct123!";
  const email = `acct_${runId}@saturate.local`;
  const passwordHash = await bcrypt.hash(password, 10);

  await withAgency(agencyId, async (client) => {
    const userRes = await client.query(
      `
        INSERT INTO users (
          agency_id, email, password_hash, display_name, role, status
        ) VALUES ($1, $2, $3, 'Accounting User', 'admin', 'active')
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
          agency_revenue_estimate_amount
        ) VALUES (
          $1, $2, $3, 'gl', $4,
          CURRENT_DATE, CURRENT_DATE + INTERVAL '120 days',
          'active', 'agency_bill',
          5000, 500, 50, 550
        )
      `,
      [agencyId, accountRes.rows[0].id, carrierRes.rows[0].id, makeId("pol")],
    );

    return userRes.rows[0].id;
  });

  const policyRes = await withAgency(agencyId, async (client) =>
    client.query(
      `SELECT id FROM policies WHERE agency_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [agencyId],
    ),
  );
  const policyId = policyRes.rows[0].id;

  const { child, baseUrl } = await startDevServer(3110);
  try {
    const login = await apiRequest(baseUrl, "POST", "/api/auth/login", {
      email,
      password,
    });
    assert.equal(login.res.status, 200);

    const cookie = login.res.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const postedBefore = await countEvents(agencyId, "policy_transaction.posted");
    const voidedBefore = await countEvents(agencyId, "policy_transaction.voided");
    const policyUpdatedBefore = await countEvents(agencyId, "policy.updated");

    const createResp = await apiRequest(
      baseUrl,
      "POST",
      `/api/ams/policies/${policyId}/transactions`,
      {
        transaction_type: "endorsement",
        transaction_date: "2026-03-01",
        status: "posted",
        source: "manual",
        memo: "Accounting posted tx",
        data: {},
        commission_delta: 120,
        cash_delta: 45,
        revenue_event: "earned",
      },
      cookie,
    );

    assert.equal(createResp.res.status, 201);
    const txId = createResp.json.data.transaction.id;

    const policyAfterPost = await fetchPolicy(agencyId, policyId);
    assert.equal(Number(policyAfterPost.commission_expected), 120);
    assert.equal(Number(policyAfterPost.commission_received), 45);
    assert.equal(policyAfterPost.last_transaction_id, txId);
    assert.equal(policyAfterPost.revenue_status, "under_collected");

    const postedAfter = await countEvents(agencyId, "policy_transaction.posted");
    const policyUpdatedAfterPost = await countEvents(agencyId, "policy.updated");
    assert.equal(postedAfter, postedBefore + 1);
    assert.equal(policyUpdatedAfterPost, policyUpdatedBefore + 1);

    const voidResp = await apiRequest(
      baseUrl,
      "POST",
      `/api/ams/policy-transactions/${txId}/void`,
      {},
      cookie,
    );

    assert.equal(voidResp.res.status, 200);

    const policyAfterVoid = await fetchPolicy(agencyId, policyId);
    assert.equal(Number(policyAfterVoid.commission_expected), 0);
    assert.equal(Number(policyAfterVoid.commission_received), 0);
    assert.equal(policyAfterVoid.last_transaction_id, txId);
    assert.equal(policyAfterVoid.revenue_status, "balanced");

    const voidedAfter = await countEvents(agencyId, "policy_transaction.voided");
    const policyUpdatedAfterVoid = await countEvents(agencyId, "policy.updated");
    assert.equal(voidedAfter, voidedBefore + 1);
    assert.equal(policyUpdatedAfterVoid, policyUpdatedBefore + 2);
  } finally {
    await stopDevServer(child);
  }

  await pool.end();
  console.log("Policy transaction accounting tests passed.");
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
