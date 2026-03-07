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
const PRIMARY_EMAIL = "producer@saturate.dev";
const PRIMARY_PASSWORD = "SaturateDev123!";
const SECONDARY_EMAIL = "producer.secondary@saturate.dev";
const SECONDARY_PASSWORD = "SaturateDev123!";

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
  if (!child.killed) child.kill("SIGKILL");
}

async function apiRequest(baseUrl, method, path, body, cookie, headers = {}) {
  const requestHeaders = new Headers(headers);
  if (cookie) requestHeaders.set("Cookie", cookie);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isFormData && body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body:
      body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });

  const text = await response.text();
  return {
    response,
    text,
    json: text ? JSON.parse(text) : null,
  };
}

async function login(baseUrl, email, password) {
  const result = await apiRequest(baseUrl, "POST", "/api/auth/login", { email, password });
  assert.equal(result.response.status, 200, `Login failed for ${email}: ${result.text}`);
  const cookie = result.response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, `Missing session cookie for ${email}`);
  const me = await apiRequest(baseUrl, "GET", "/api/auth/me", undefined, cookie);
  assert.equal(me.response.status, 200, `Failed to load /api/auth/me for ${email}: ${me.text}`);
  return { cookie, me: me.json };
}

async function ensureSecondaryProducer(agencyId) {
  const hash = await bcrypt.hash(SECONDARY_PASSWORD, 10);
  return withAgency(agencyId, async (client) => {
    const existing = await client.query(
      `
        SELECT id
        FROM users
        WHERE agency_id = $1
          AND email = $2
        LIMIT 1
      `,
      [agencyId, SECONDARY_EMAIL],
    );

    if ((existing.rowCount ?? 0) > 0) {
      await client.query(
        `
          UPDATE users
          SET password_hash = $3,
              display_name = 'Producer Secondary',
              role = 'producer',
              status = 'active'
          WHERE agency_id = $1
            AND email = $2
        `,
        [agencyId, SECONDARY_EMAIL, hash],
      );
      return existing.rows[0].id;
    }

    const inserted = await client.query(
      `
        INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
        VALUES ($1, $2, $3, 'Producer Secondary', 'producer', 'active')
        RETURNING id
      `,
      [agencyId, SECONDARY_EMAIL, hash],
    );

    return inserted.rows[0].id;
  });
}

async function main() {
  const { child, baseUrl } = await startDevServer(3141);

  try {
    const primary = await login(baseUrl, PRIMARY_EMAIL, PRIMARY_PASSWORD);
    const secondaryProducerId = await ensureSecondaryProducer(primary.me.agency_id);

    const createPipeline = await apiRequest(
      baseUrl,
      "POST",
      "/api/crm/pipelines",
      {
        name: makeId("Leads Pipeline"),
        visibility_type: "agency",
      },
      primary.cookie,
    );
    assert.equal(createPipeline.response.status, 201, createPipeline.text);
    const pipelineId = createPipeline.json.data.id;
    const defaultStage = createPipeline.json.data.stages.find((stage) => stage.stage_type === "open");
    assert.ok(defaultStage, "Expected default open stage");

    const createUnassignedLead = await apiRequest(
      baseUrl,
      "POST",
      "/api/crm/leads",
      {
        first_name: "Morgan",
        last_name: makeId("Lead"),
        email: `${Date.now()}@example.com`,
        source: "manual",
      },
      primary.cookie,
    );
    assert.equal(createUnassignedLead.response.status, 201, createUnassignedLead.text);
    assert.equal(createUnassignedLead.json.data.assignment_status, "unassigned");
    const leadId = createUnassignedLead.json.data.id;

    const assignLead = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/crm/leads/${leadId}`,
      {
        assigned_producer_id: primary.me.user_id,
        assignment_status: "assigned",
      },
      primary.cookie,
    );
    assert.equal(assignLead.response.status, 200, assignLead.text);
    assert.equal(assignLead.json.data.assigned_producer_id, primary.me.user_id);

    const csv = [
      "first_name,last_name,company,email,phone",
      `Avery,RoundRobin,Blue Harbor,rr1-${Date.now()}@example.com,555-0001`,
      `Jamie,RoundRobin,Summit Peak,rr2-${Date.now()}@example.com,555-0002`,
    ].join("\n");
    const importForm = new FormData();
    importForm.set("file", new File([csv], "leads.csv", { type: "text/csv" }));
    importForm.set("assignment_mode", "round_robin");
    importForm.set("producer_user_ids", JSON.stringify([primary.me.user_id, secondaryProducerId]));
    importForm.set("source", "csv_import");
    importForm.set("list_name", makeId("Lead Import"));

    const importLeads = await apiRequest(
      baseUrl,
      "POST",
      "/api/crm/leads/import",
      importForm,
      primary.cookie,
    );
    assert.equal(importLeads.response.status, 201, importLeads.text);
    assert.equal(importLeads.json.data.created_count, 2);
    const importedProducerIds = importLeads.json.data.leads.map((lead) => lead.assigned_producer_id);
    assert.deepEqual(importedProducerIds, [primary.me.user_id, secondaryProducerId]);

    const convertLead = await apiRequest(
      baseUrl,
      "POST",
      `/api/crm/leads/${leadId}/convert`,
      {
        pipeline_id: pipelineId,
        pipeline_stage_id: defaultStage.id,
        create_account: true,
        estimated_revenue: 2500,
        next_step: "Send proposal",
      },
      primary.cookie,
    );
    assert.equal(convertLead.response.status, 201, convertLead.text);
    assert.equal(convertLead.json.data.lead.status, "converted");
    assert.equal(convertLead.json.data.deal.pipeline_id, pipelineId);
    assert.equal(convertLead.json.data.deal.lead_id, leadId);
    assert.ok(convertLead.json.data.account?.id, "Expected created account on conversion");

    const listLeads = await apiRequest(
      baseUrl,
      "GET",
      "/api/crm/leads?view=all&page_size=100",
      undefined,
      primary.cookie,
    );
    assert.equal(listLeads.response.status, 200, listLeads.text);
    assert.equal(listLeads.json.ok, true);
    assert.ok(Array.isArray(listLeads.json.data));
    assert.ok(listLeads.json.data.some((lead) => lead.id === leadId));
  } finally {
    await stopDevServer(child);
    await pool.end();
  }
}

await main();
