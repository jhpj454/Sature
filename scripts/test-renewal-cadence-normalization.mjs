import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { config as loadDotenv } from "dotenv";
import bcrypt from "bcrypt";
import { Pool } from "pg";
import { normalizeServiceCasePriority } from "../src/server/automation/timeTriggers.mjs";

loadDotenv({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing.");
}

const require = createRequire(import.meta.url);
const migration017 = require("../migrations/017_phase1c_renewal_rules_cadence_normalization.js");

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

async function runMigrationUp() {
  const client = await pool.connect();
  try {
    let chain = Promise.resolve();
    await migration017.up({
      sql: (text) => {
        chain = chain.then(() => client.query(text));
      },
    });
    await chain;
  } finally {
    client.release();
  }
}

async function main() {
  const agencyName = `Renewal Cadence Test ${makeId("agency")}`;
  const agencyRes = await pool.query(
    `
      INSERT INTO agencies (name, timezone, plan, status)
      VALUES ($1, 'America/Chicago', 'saturate', 'active')
      RETURNING id
    `,
    [agencyName],
  );
  const agencyId = agencyRes.rows[0].id;

  const hash = await bcrypt.hash("pass123!", 10);

  const users = await withAgency(agencyId, async (client) => {
    const u1 = await client.query(
      `
        INSERT INTO users (
          agency_id, email, password_hash, display_name, role, status
        ) VALUES ($1, $2, $3, 'Rule User 1', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, `${makeId("u1")}@local.test`, hash],
    );

    const u2 = await client.query(
      `
        INSERT INTO users (
          agency_id, email, password_hash, display_name, role, status
        ) VALUES ($1, $2, $3, 'Rule User 2', 'admin', 'active')
        RETURNING id
      `,
      [agencyId, `${makeId("u2")}@local.test`, hash],
    );

    return {
      user1: u1.rows[0].id,
      user2: u2.rows[0].id,
    };
  });

  await pool.query("DROP INDEX IF EXISTS renewal_rules_agency_day_active_uidx");

  await withAgency(agencyId, async (client) => {
    await client.query(
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
        ) VALUES
          ($1, false, 30, false, 'low',  $2, '{}'::jsonb, $2, $2),
          ($1, true,  30, true,  'high', NULL, '{}'::jsonb, $3, $3),
          ($1, false, 1,  false, 'low',  $3, '{}'::jsonb, $3, $3),
          ($1, true,  90, true,  'high', NULL, '{}'::jsonb, $2, $2)
      `,
      [agencyId, users.user1, users.user2],
    );

    await client.query(
      `
        UPDATE renewal_rules
        SET updated_at = now() - interval '3 days'
        WHERE agency_id = $1
          AND days_before_expiration = 30
          AND assign_to = $2
      `,
      [agencyId, users.user1],
    );

    await client.query(
      `
        UPDATE renewal_rules
        SET updated_at = now() - interval '1 day'
        WHERE agency_id = $1
          AND days_before_expiration = 1
      `,
      [agencyId],
    );
  });

  const expectedAgencyAssignee = await withAgency(agencyId, (client) =>
    client.query(
      `
        SELECT assign_to
        FROM renewal_rules
        WHERE agency_id = $1
          AND deleted_at IS NULL
          AND assign_to IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        LIMIT 1
      `,
      [agencyId],
    ),
  );

  await runMigrationUp();
  await runMigrationUp();

  const targetRows = await withAgency(agencyId, (client) =>
    client.query(
      `
        SELECT
          agency_id,
          days_before_expiration,
          case_priority,
          is_enabled,
          create_case,
          assign_to,
          deleted_at
        FROM renewal_rules
        WHERE agency_id = $1
          AND days_before_expiration IN (120, 90, 60, 30, 14, 7, 1)
          AND deleted_at IS NULL
        ORDER BY days_before_expiration DESC
      `,
      [agencyId],
    ),
  );

  assert.equal(targetRows.rowCount, 7, "agency should have exactly 7 active target rules");

  const expected = new Map([
    [120, "low"],
    [90, "low"],
    [60, "normal"],
    [30, "normal"],
    [14, "high"],
    [7, "high"],
    [1, "high"],
  ]);

  for (const row of targetRows.rows) {
    assert.equal(row.is_enabled, true);
    assert.equal(row.create_case, true);
    assert.equal(row.case_priority, expected.get(Number(row.days_before_expiration)));
  }

  const duplicateDay30 = await withAgency(agencyId, (client) =>
    client.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_count,
          COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_count
        FROM renewal_rules
        WHERE agency_id = $1
          AND days_before_expiration = 30
      `,
      [agencyId],
    ),
  );

  assert.equal(duplicateDay30.rows[0].active_count, 1);
  assert.ok(duplicateDay30.rows[0].deleted_count >= 1);

  const inheritedDay120 = await withAgency(agencyId, (client) =>
    client.query(
      `
        SELECT assign_to
        FROM renewal_rules
        WHERE agency_id = $1
          AND days_before_expiration = 120
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [agencyId],
    ),
  );

  assert.equal(
    inheritedDay120.rows[0].assign_to,
    expectedAgencyAssignee.rows[0].assign_to,
    "missing offsets should inherit agency best assign_to",
  );

  let duplicateInsertFailed = false;
  await withAgency(agencyId, async (client) => {
    try {
      await client.query(
        `
          INSERT INTO renewal_rules (
            agency_id,
            is_enabled,
            days_before_expiration,
            create_case,
            case_priority,
            metadata
          ) VALUES ($1, true, 120, true, 'low', '{}'::jsonb)
        `,
        [agencyId],
      );
    } catch (error) {
      duplicateInsertFailed = error.code === "23505";
    }
  });

  assert.equal(duplicateInsertFailed, true, "unique active index should reject duplicates");

  assert.equal(normalizeServiceCasePriority("medium"), "normal");
  assert.equal(normalizeServiceCasePriority("normal"), "normal");
  assert.equal(normalizeServiceCasePriority("low"), "low");
  assert.equal(normalizeServiceCasePriority("urgent"), "urgent");

  process.stdout.write("Renewal cadence normalization test passed.\n");
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
