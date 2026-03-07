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

async function createAgencyWithUser(seed) {
  const agencyRes = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [`API Accounts ${seed}`],
  );
  const agencyId = agencyRes.rows[0].id;
  const email = `${seed}@saturate.local`;
  const password = "Acc12345!";
  const hash = await bcrypt.hash(password, 10);

  const userId = await withAgency(agencyId, async (client) => {
    const res = await client.query(
      `
        INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'API Accounts User', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, email, hash],
    );
    return res.rows[0].id;
  });

  return { agencyId, email, password, userId };
}

async function main() {
  const runId = makeId("acct_api");
  const fixtureA = await createAgencyWithUser(`a_${runId}`);
  const fixtureB = await createAgencyWithUser(`b_${runId}`);

  const { child, baseUrl } = await startDevServer(3130);

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
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'account.create'",
    );
    const beforeCreateEvents = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'account.created'",
    );

    const createAccount = await apiRequest(
      baseUrl,
      "POST",
      "/api/accounts",
      {
        account_type: "commercial",
        account_name: `Test Account ${runId}`,
        status: "prospect",
        assigned_producer_id: fixtureA.userId,
      },
      cookieA,
    );

    assert.equal(createAccount.response.status, 201);
    const accountId = createAccount.json.data.id;
    assert.equal(createAccount.json.data.agency_id, fixtureA.agencyId);

    const afterCreateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'account.create'",
    );
    const afterCreateEvents = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'account.created'",
    );
    assert.equal(afterCreateAudit, beforeCreateAudit + 1);
    assert.equal(afterCreateEvents, beforeCreateEvents + 1);

    const listAccounts = await apiRequest(
      baseUrl,
      "GET",
      `/api/accounts?status=prospect&assigned_producer_id=${fixtureA.userId}`,
      undefined,
      cookieA,
    );
    assert.equal(
      listAccounts.response.status,
      200,
      `list accounts failed: status=${listAccounts.response.status} body=${JSON.stringify(listAccounts.json)}`,
    );
    assert.ok(Array.isArray(listAccounts.json.data));
    assert.ok(listAccounts.json.pagination.total >= 1);

    const getById = await apiRequest(baseUrl, "GET", `/api/accounts/${accountId}`, undefined, cookieA);
    assert.equal(getById.response.status, 200);
    assert.equal(getById.json.data.id, accountId);

    const beforeUpdateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'account.update'",
    );

    const patch = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/accounts/${accountId}`,
      {
        status: "client",
      },
      cookieA,
    );
    assert.equal(patch.response.status, 200);
    assert.equal(patch.json.data.status, "client");

    const afterUpdateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'account.update'",
    );
    assert.equal(afterUpdateAudit, beforeUpdateAudit + 1);

    const crossGet = await apiRequest(
      baseUrl,
      "GET",
      `/api/accounts/${accountId}`,
      undefined,
      cookieB,
    );
    assert.equal(crossGet.response.status, 404);

    const crossPatch = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/accounts/${accountId}`,
      { status: "lost" },
      cookieB,
    );
    assert.equal(crossPatch.response.status, 404);

    process.stdout.write("Accounts API integration checks passed.\n");
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
