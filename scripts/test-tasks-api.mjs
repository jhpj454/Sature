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

async function createFixture(seed) {
  const agencyRes = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [`Tasks API ${seed}`],
  );
  const agencyId = agencyRes.rows[0].id;
  const email = `${seed}@saturate.local`;
  const password = "Task12345!";
  const hash = await bcrypt.hash(password, 10);
  const secondEmail = `${seed}_second@saturate.local`;
  const secondHash = await bcrypt.hash(password, 10);

  return withAgency(agencyId, async (client) => {
    const userRes = await client.query(
      `
        INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'Tasks User', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, email, hash],
    );

    const secondUserRes = await client.query(
      `
        INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'Tasks User 2', 'csr', 'active')
        RETURNING id
      `,
      [agencyId, secondEmail, secondHash],
    );

    const accountRes = await client.query(
      `
        INSERT INTO accounts (agency_id, account_type, account_name, status)
        VALUES ($1, 'commercial', $2, 'client')
        RETURNING id
      `,
      [agencyId, makeId("acct")],
    );

    const serviceCaseRes = await client.query(
      `
        INSERT INTO service_cases (
          agency_id,
          case_type,
          status,
          priority,
          account_id,
          assigned_to_user_id,
          title
        ) VALUES ($1, 'renewal', 'open', 'high', $2, $3, $4)
        RETURNING id
      `,
      [agencyId, accountRes.rows[0].id, userRes.rows[0].id, makeId("svc")],
    );

    return {
      agencyId,
      email,
      password,
      userId: userRes.rows[0].id,
      secondUserId: secondUserRes.rows[0].id,
      serviceCaseId: serviceCaseRes.rows[0].id,
    };
  });
}

async function main() {
  const runId = makeId("tasks");
  const fixtureA = await createFixture(`a_${runId}`);
  const fixtureB = await createFixture(`b_${runId}`);

  const { child, baseUrl } = await startDevServer(3133);

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
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'task.create'",
    );
    const beforeCreateEvent = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'task.created'",
    );

    const create = await apiRequest(
      baseUrl,
      "POST",
      "/api/tasks",
      {
        title: "Follow-up call",
        description: "Call insured to confirm details",
        due_date: "2026-06-01",
        assigned_to_user_id: fixtureA.userId,
        linked_entity_type: "service_case",
        linked_entity_id: fixtureA.serviceCaseId,
      },
      cookieA,
    );
    assert.equal(create.response.status, 201);
    const taskId = create.json.data.id;

    const afterCreateAudit = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM audit_log WHERE action = 'task.create'",
    );
    const afterCreateEvent = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'task.created'",
    );
    assert.equal(afterCreateAudit, beforeCreateAudit + 1);
    assert.equal(afterCreateEvent, beforeCreateEvent + 1);

    const list = await apiRequest(
      baseUrl,
      "GET",
      `/api/tasks?assigned_to_user_id=${fixtureA.userId}&status=open`,
      undefined,
      cookieA,
    );
    assert.equal(list.response.status, 200);
    assert.ok(list.json.data.some((row) => row.id === taskId));

    const beforeCompletedEvent = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'task.completed'",
    );
    const complete = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/tasks/${taskId}`,
      { status: "completed" },
      cookieA,
    );
    assert.equal(complete.response.status, 200);
    assert.equal(complete.json.data.status, "completed");
    const afterCompletedEvent = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'task.completed'",
    );
    assert.equal(afterCompletedEvent, beforeCompletedEvent + 1);

    const beforeReassignEvent = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'task.reassigned'",
    );
    const reassign = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/tasks/${taskId}`,
      { assigned_to_user_id: fixtureA.secondUserId },
      cookieA,
    );
    assert.equal(reassign.response.status, 200);
    assert.equal(reassign.json.data.assigned_to_user_id, fixtureA.secondUserId);
    const afterReassignEvent = await countRows(
      fixtureA.agencyId,
      "SELECT COUNT(*)::int AS count FROM events WHERE event_type = 'task.reassigned'",
    );
    assert.equal(afterReassignEvent, beforeReassignEvent + 1);

    const queue = await apiRequest(baseUrl, "GET", "/api/work-queue", undefined, cookieA);
    assert.equal(queue.response.status, 200);
    assert.ok(Array.isArray(queue.json.data));
    assert.ok(queue.json.data.some((row) => row.type === "service_case"));

    const crossPatch = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/tasks/${taskId}`,
      { status: "open" },
      cookieB,
    );
    assert.equal(crossPatch.response.status, 404);

    process.stdout.write("Tasks API integration checks passed.\n");
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
