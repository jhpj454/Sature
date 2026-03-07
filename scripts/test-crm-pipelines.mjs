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
  if (!child.killed) {
    child.kill("SIGKILL");
  }
}

async function apiRequest(baseUrl, method, path, body, cookie) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  return {
    response,
    text,
    json: text ? JSON.parse(text) : null,
  };
}

async function pageRequest(baseUrl, path, cookie) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers,
  });
  const text = await response.text();
  return { response, text };
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

    if (existing.rowCount > 0) {
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
  const { child, baseUrl } = await startDevServer(3139);

  try {
    const primary = await login(baseUrl, PRIMARY_EMAIL, PRIMARY_PASSWORD);
    assert.ok(primary.me?.agency_id, "Primary producer session missing agency_id");
    await ensureSecondaryProducer(primary.me.agency_id);
    const secondary = await login(baseUrl, SECONDARY_EMAIL, SECONDARY_PASSWORD);

    const createPipeline = await apiRequest(baseUrl, "POST", "/api/crm/pipelines", {
      name: makeId("Private Pipeline"),
      description: "Regression test private pipeline",
      visibility_type: "private",
    }, primary.cookie);
    assert.equal(createPipeline.response.status, 201, createPipeline.text);
    assert.equal(createPipeline.json?.ok, true);
    assert.equal(createPipeline.json?.data?.visibility_type, "private");
    assert.ok(Array.isArray(createPipeline.json?.data?.stages), "Expected default stages array");
    assert.equal(createPipeline.json.data.stages.length, 8, "Expected 8 default stages");

    const pipelineId = createPipeline.json.data.id;
    const stages = createPipeline.json.data.stages;
    const openStage = stages.find((stage) => stage.stage_type === "open");
    const boundStage = stages.find((stage) => stage.name === "Bound");
    const lostStage = stages.find((stage) => stage.name === "Lost");
    assert.ok(openStage, "Missing open stage");
    assert.ok(boundStage, "Missing Bound stage");
    assert.ok(lostStage, "Missing Lost stage");

    const pipelineListPrimary = await apiRequest(baseUrl, "GET", "/api/crm/pipelines", undefined, primary.cookie);
    assert.equal(pipelineListPrimary.response.status, 200, pipelineListPrimary.text);
    assert.ok(
      pipelineListPrimary.json?.data?.some((pipeline) => pipeline.id === pipelineId),
      "Primary producer should see the private pipeline",
    );

    const stageList = await apiRequest(
      baseUrl,
      "GET",
      `/api/crm/pipelines/${pipelineId}/stages`,
      undefined,
      primary.cookie,
    );
    assert.equal(stageList.response.status, 200, stageList.text);
    assert.equal(stageList.json?.data?.length, 8, "Expected 8 stages from list route");

    const stageToEdit = stageList.json.data.find((stage) => stage.name === "Qualified");
    assert.ok(stageToEdit, "Expected Qualified stage");
    const stageEdit = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/crm/pipelines/${pipelineId}/stages/${stageToEdit.id}`,
      {
        probability_pct: 35,
        forecast_category: "best_case",
      },
      primary.cookie,
    );
    assert.equal(stageEdit.response.status, 200, stageEdit.text);
    assert.equal(stageEdit.json?.data?.probability_pct, 35);
    assert.equal(stageEdit.json?.data?.forecast_category, "best_case");

    const pipelineListSecondary = await apiRequest(baseUrl, "GET", "/api/crm/pipelines", undefined, secondary.cookie);
    assert.equal(pipelineListSecondary.response.status, 200, pipelineListSecondary.text);
    assert.ok(
      !pipelineListSecondary.json?.data?.some((pipeline) => pipeline.id === pipelineId),
      "Secondary producer must not see the private pipeline",
    );

    const privatePipelineRead = await apiRequest(
      baseUrl,
      "GET",
      `/api/crm/pipelines/${pipelineId}`,
      undefined,
      secondary.cookie,
    );
    assert.equal(privatePipelineRead.response.status, 404, privatePipelineRead.text);

    const createDeal = await apiRequest(baseUrl, "POST", "/api/crm/deals", {
      pipeline_id: pipelineId,
      pipeline_stage_id: openStage.id,
      name: makeId("Deal"),
      estimated_revenue: 2500,
      estimated_premium: 12000,
      estimated_commission_pct: 0.12,
      next_step: "Call insured",
    }, primary.cookie);
    assert.equal(createDeal.response.status, 201, createDeal.text);
    assert.equal(createDeal.json?.data?.status, "open");

    const dealId = createDeal.json.data.id;

    const dealWon = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/crm/deals/${dealId}`,
      { pipeline_stage_id: boundStage.id },
      primary.cookie,
    );
    assert.equal(dealWon.response.status, 200, dealWon.text);
    assert.equal(dealWon.json?.data?.status, "won");

    const secondDeal = await apiRequest(baseUrl, "POST", "/api/crm/deals", {
      pipeline_id: pipelineId,
      pipeline_stage_id: openStage.id,
      name: makeId("DealLost"),
      estimated_revenue: 1800,
    }, primary.cookie);
    assert.equal(secondDeal.response.status, 201, secondDeal.text);

    const dealLost = await apiRequest(
      baseUrl,
      "PATCH",
      `/api/crm/deals/${secondDeal.json.data.id}`,
      { pipeline_stage_id: lostStage.id },
      primary.cookie,
    );
    assert.equal(dealLost.response.status, 200, dealLost.text);
    assert.equal(dealLost.json?.data?.status, "lost");

    const dealsList = await apiRequest(
      baseUrl,
      "GET",
      `/api/crm/deals?pipeline_id=${pipelineId}`,
      undefined,
      primary.cookie,
    );
    assert.equal(dealsList.response.status, 200, dealsList.text);
    assert.ok(Array.isArray(dealsList.json?.data), "Expected deals list array");
    assert.ok(dealsList.json.data.length >= 2, "Expected created deals in pipeline list");

    const winDealsPage = await pageRequest(
      baseUrl,
      `/crm/win-deals?pipeline_id=${pipelineId}`,
      primary.cookie,
    );
    assert.equal(winDealsPage.response.status, 200, winDealsPage.text);
    assert.match(winDealsPage.text, /Win Deals/);
    assert.match(winDealsPage.text, new RegExp(createPipeline.json.data.name));

    const pipelineSettingsPage = await pageRequest(
      baseUrl,
      "/crm/settings/pipelines",
      primary.cookie,
    );
    assert.equal(pipelineSettingsPage.response.status, 200, pipelineSettingsPage.text);
    assert.match(pipelineSettingsPage.text, /Pipeline Settings/);

    const pipelineDetailPage = await pageRequest(
      baseUrl,
      `/crm/settings/pipelines/${pipelineId}`,
      primary.cookie,
    );
    assert.equal(pipelineDetailPage.response.status, 200, pipelineDetailPage.text);
    assert.match(pipelineDetailPage.text, new RegExp(createPipeline.json.data.name));

    process.stdout.write("CRM pipeline foundation checks passed.\n");
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
