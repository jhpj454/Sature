import { Pool } from "pg";
import {
  evaluatePolicyExpirationOffsets,
  normalizeServiceCasePriority,
} from "../automation/timeTriggers.mjs";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function dedupeKey(policyId, expirationDate, daysBeforeExpiration) {
  return `renewal:${policyId}:${expirationDate}:${daysBeforeExpiration}`;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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

async function insertAudit(client, payload) {
  await client.query(
    `
      INSERT INTO audit_log (
        agency_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json,
        request_id,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      payload.agencyId,
      payload.actorUserId ?? null,
      payload.action,
      payload.entityType,
      payload.entityId ?? null,
      payload.beforeJson ? JSON.stringify(payload.beforeJson) : null,
      payload.afterJson ? JSON.stringify(payload.afterJson) : null,
      payload.requestId ?? null,
      payload.ipAddress ?? null,
      payload.userAgent ?? null,
    ],
  );
}

async function insertEvent(client, payload) {
  await client.query(
    `
      INSERT INTO events (
        agency_id,
        event_type,
        entity_type,
        entity_id,
        contact_id,
        meta_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      payload.agencyId,
      payload.eventType,
      payload.entityType ?? null,
      payload.entityId ?? null,
      payload.contactId ?? null,
      payload.metaJson ? JSON.stringify(payload.metaJson) : null,
    ],
  );
}

async function runForAgency({
  agencyId,
  initiatedByUserId,
  requestMeta,
}) {
  return withTransaction(async (client) => {
    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [agencyId]);
    const actorRes =
      initiatedByUserId === null
        ? { rowCount: 0 }
        : await client.query(
            "SELECT id FROM users WHERE id = $1 AND agency_id = $2 LIMIT 1",
            [initiatedByUserId, agencyId],
          );
    const actorUserId = actorRes.rowCount > 0 ? initiatedByUserId : null;

    const jobRunInsertRes = await client.query(
      `
        INSERT INTO job_runs (
          agency_id,
          job_name,
          status,
          summary,
          created_by,
          updated_by
        ) VALUES ($1, 'renewal.generate_cases', 'running', $2, $3, $3)
        RETURNING *
      `,
      [
        agencyId,
        JSON.stringify({
          agencies_processed: 1,
          policies_scanned: 0,
          cases_created: 0,
          cases_skipped: 0,
        }),
        actorUserId,
      ],
    );

    const jobRun = jobRunInsertRes.rows[0];

    await insertAudit(client, {
      agencyId,
      actorUserId,
      action: "job_run.start",
      entityType: "job_runs",
      entityId: jobRun.id,
      afterJson: jobRun,
      requestId: requestMeta?.requestId ?? null,
      ipAddress: requestMeta?.ipAddress ?? null,
      userAgent: requestMeta?.userAgent ?? null,
    });

    const rulesRes = await client.query(
      `
        SELECT
          id,
          days_before_expiration,
          case_priority,
          assign_to
        FROM renewal_rules
        WHERE agency_id = $1
          AND deleted_at IS NULL
          AND is_enabled = true
          AND create_case = true
        ORDER BY days_before_expiration DESC, created_at ASC
      `,
      [agencyId],
    );

    const rulesByOffset = new Map();
    for (const row of rulesRes.rows) {
      const offset = Number(row.days_before_expiration);
      if (!Number.isInteger(offset) || offset < 0) {
        continue;
      }

      if (rulesByOffset.has(offset)) {
        continue;
      }

      rulesByOffset.set(offset, {
        ...row,
        normalized_priority: normalizeServiceCasePriority(row.case_priority),
      });
    }

    let policiesScanned = 0;
    let casesCreated = 0;
    let casesSkipped = 0;

    if (rulesByOffset.size > 0) {
      const offsets = [...rulesByOffset.keys()].sort((a, b) => b - a);
      const minOffset = Math.min(...offsets);
      const maxOffset = Math.max(...offsets);

      const policiesRes = await client.query(
        `
          SELECT
            id,
            policy_number,
            expiration_date,
            assigned_csr_id,
            csr_id
          FROM policies
          WHERE agency_id = $1
            AND status IN ('active', 'pending', 'quoted')
            AND expiration_date >= current_date + ($2::int * interval '1 day')
            AND expiration_date < current_date + (($3::int + 1) * interval '1 day')
        `,
        [agencyId, minOffset, maxOffset],
      );

      for (const policy of policiesRes.rows) {
        const triggerEvents = evaluatePolicyExpirationOffsets({
          agencyId,
          policyId: policy.id,
          expirationDate: policy.expiration_date,
          offsetDaysList: offsets,
        });

        for (const triggerEvent of triggerEvents) {
          const rule = rulesByOffset.get(triggerEvent.offsetDays);
          if (!rule) {
            continue;
          }

          policiesScanned += 1;

          const dedupe = dedupeKey(
            policy.id,
            triggerEvent.effectiveDate,
            triggerEvent.offsetDays,
          );

          const assignedTo = rule.assign_to ?? policy.assigned_csr_id ?? policy.csr_id ?? null;
          const title = `Renewal: Policy ${policy.policy_number} expiring ${triggerEvent.effectiveDate}`;

          const caseInsertRes = await client.query(
            `
              INSERT INTO service_cases (
                agency_id,
                case_type,
                status,
                priority,
                policy_id,
                assigned_to_user_id,
                title,
                dedupe_key
              ) VALUES ($1, 'renewal', 'open', $2, $3, $4, $5, $6)
              ON CONFLICT (agency_id, dedupe_key)
              WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL
              DO NOTHING
              RETURNING *
            `,
            [
              agencyId,
              rule.normalized_priority,
              policy.id,
              assignedTo,
              title,
              dedupe,
            ],
          );

          const serviceCase = caseInsertRes.rows[0];

          if (!serviceCase) {
            casesSkipped += 1;
            continue;
          }

          casesCreated += 1;

          const activityRes = await client.query(
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
              ) VALUES ($1, 'service_case', $2, 'system', now(), $3, $4, $5, $5)
              RETURNING *
            `,
            [
              agencyId,
              serviceCase.id,
              `Renewal case generated (${triggerEvent.offsetDays} days before expiration)`,
              JSON.stringify({
                rule_id: rule.id,
                policy_id: policy.id,
                expiration_date: triggerEvent.effectiveDate,
                days_before_expiration: triggerEvent.offsetDays,
                dedupe_key: dedupe,
              }),
              actorUserId,
            ],
          );

          const activity = activityRes.rows[0];

          await insertAudit(client, {
            agencyId,
            actorUserId,
            action: "service_case.create",
            entityType: "service_cases",
            entityId: serviceCase.id,
            afterJson: serviceCase,
            requestId: requestMeta?.requestId ?? null,
            ipAddress: requestMeta?.ipAddress ?? null,
            userAgent: requestMeta?.userAgent ?? null,
          });

          await insertAudit(client, {
            agencyId,
            actorUserId,
            action: "activity.create",
            entityType: "activities",
            entityId: activity.id,
            afterJson: activity,
            requestId: requestMeta?.requestId ?? null,
            ipAddress: requestMeta?.ipAddress ?? null,
            userAgent: requestMeta?.userAgent ?? null,
          });

          await insertEvent(client, {
            agencyId,
            eventType: "renewal.case_generated",
            entityType: "service_case",
            entityId: serviceCase.id,
            metaJson: {
              policy_id: policy.id,
              service_case_id: serviceCase.id,
              rule_id: rule.id,
              expiration_date: triggerEvent.effectiveDate,
              offsetDays: triggerEvent.offsetDays,
              days_before_expiration: triggerEvent.offsetDays,
              dedupe_key: dedupe,
            },
          });

          await insertEvent(client, {
            agencyId,
            eventType: "service_case.created",
            entityType: "service_case",
            entityId: serviceCase.id,
            metaJson: {
              case_type: serviceCase.case_type,
              status: serviceCase.status,
              priority: serviceCase.priority,
              policy_id: serviceCase.policy_id,
            },
          });

          await insertEvent(client, {
            agencyId,
            eventType: "activity.created",
            entityType: "activity",
            entityId: activity.id,
            metaJson: {
              entity_type: activity.entity_type,
              entity_id: activity.entity_id,
              activity_type: activity.activity_type,
            },
          });
        }
      }
    }

    const summary = {
      agencies_processed: 1,
      policies_scanned: policiesScanned,
      cases_created: casesCreated,
      cases_skipped: casesSkipped,
    };

    const completedRes = await client.query(
      `
        UPDATE job_runs
        SET
          status = 'success',
          summary = $2,
          finished_at = now(),
          updated_by = $3
        WHERE id = $1
        RETURNING *
      `,
      [jobRun.id, JSON.stringify(summary), actorUserId],
    );

    await insertAudit(client, {
      agencyId,
      actorUserId,
      action: "job_run.complete",
      entityType: "job_runs",
      entityId: jobRun.id,
      beforeJson: jobRun,
      afterJson: completedRes.rows[0],
      requestId: requestMeta?.requestId ?? null,
      ipAddress: requestMeta?.ipAddress ?? null,
      userAgent: requestMeta?.userAgent ?? null,
    });

    return {
      agency_id: agencyId,
      job_run_id: jobRun.id,
      status: "success",
      summary,
      error: null,
    };
  });
}

async function writeAgencyFailureRun({
  agencyId,
  initiatedByUserId,
  requestMeta,
  error,
}) {
  return withTransaction(async (client) => {
    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [agencyId]);
    const actorRes =
      initiatedByUserId === null
        ? { rowCount: 0 }
        : await client.query(
            "SELECT id FROM users WHERE id = $1 AND agency_id = $2 LIMIT 1",
            [initiatedByUserId, agencyId],
          );
    const actorUserId = actorRes.rowCount > 0 ? initiatedByUserId : null;

    const failureRes = await client.query(
      `
        INSERT INTO job_runs (
          agency_id,
          job_name,
          status,
          started_at,
          finished_at,
          summary,
          error,
          created_by,
          updated_by
        ) VALUES (
          $1,
          'renewal.generate_cases',
          'failed',
          now(),
          now(),
          $2,
          $3,
          $4,
          $4
        )
        RETURNING *
      `,
      [
        agencyId,
        JSON.stringify({
          agencies_processed: 1,
          policies_scanned: 0,
          cases_created: 0,
          cases_skipped: 0,
        }),
        error.message,
        actorUserId,
      ],
    );

    const row = failureRes.rows[0];

    await insertAudit(client, {
      agencyId,
      actorUserId,
      action: "job_run.failed",
      entityType: "job_runs",
      entityId: row.id,
      afterJson: row,
      requestId: requestMeta?.requestId ?? null,
      ipAddress: requestMeta?.ipAddress ?? null,
      userAgent: requestMeta?.userAgent ?? null,
    });

    return row;
  });
}

/**
 * @typedef {Object} RenewalJobRequestMeta
 * @property {string | null | undefined} [requestId]
 * @property {string | null | undefined} [ipAddress]
 * @property {string | null | undefined} [userAgent]
 */

/**
 * @typedef {Object} RunRenewalAutomationJobOptions
 * @property {string | null | undefined} [initiatedByUserId]
 * @property {RenewalJobRequestMeta | undefined} [requestMeta]
 * @property {string | null | undefined} [onlyAgencyId]
 */

/**
 * @param {RunRenewalAutomationJobOptions} [options]
 */
export async function runRenewalAutomationJob({
  initiatedByUserId = null,
  requestMeta,
  onlyAgencyId = null,
} = {}) {
  const agenciesRes = onlyAgencyId
    ? await pool.query("SELECT id FROM agencies WHERE id = $1 LIMIT 1", [onlyAgencyId])
    : await pool.query(
        "SELECT id FROM agencies WHERE status IN ('active', 'trial') ORDER BY created_at ASC",
      );

  const perAgency = [];

  for (const agency of agenciesRes.rows) {
    try {
      const agencyResult = await runForAgency({
        agencyId: agency.id,
        initiatedByUserId,
        requestMeta,
      });
      perAgency.push(agencyResult);
    } catch (error) {
      const failureRun = await writeAgencyFailureRun({
        agencyId: agency.id,
        initiatedByUserId,
        requestMeta,
        error: error instanceof Error ? error : new Error("Unknown renewal job error."),
      });

      perAgency.push({
        agency_id: agency.id,
        job_run_id: failureRun.id,
        status: "failed",
        summary: failureRun.summary,
        error: failureRun.error,
      });
    }
  }

  const totals = perAgency.reduce(
    (acc, row) => {
      const summary = row.summary ?? {};
      acc.agencies_processed += 1;
      acc.policies_scanned += Number(summary.policies_scanned ?? 0);
      acc.cases_created += Number(summary.cases_created ?? 0);
      acc.cases_skipped += Number(summary.cases_skipped ?? 0);
      if (row.status === "failed") {
        acc.failures += 1;
      }
      return acc;
    },
    {
      agencies_processed: 0,
      policies_scanned: 0,
      cases_created: 0,
      cases_skipped: 0,
      failures: 0,
    },
  );

  return {
    ok: totals.failures === 0,
    totals,
    per_agency: perAgency,
  };
}

export async function closeRenewalAutomationJobPool() {
  await pool.end();
}
