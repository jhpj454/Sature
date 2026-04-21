import type { PoolClient } from "pg";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import { expandRRule } from "@/src/server/rrule";

type RuleEngineResult = {
  created: number;
  skipped: number;
  errors: string[];
};

type TaskAutomationRule = {
  id: string;
  agency_id: string;
  name: string;
  template_id: string;
  trigger_type: string;
  trigger_offset_days: number | null;
  segment_filters: Record<string, unknown>;
  recurrence_rule: string | null;
  is_active: boolean;
  // from join
  template_name: string;
  template_description: string | null;
  default_offset_days: number | null;
  default_assignee_role: string | null;
};

type CandidateEntity = {
  entity_type: string;
  entity_id: string;
  filter_fields: Record<string, unknown>;
  trigger_date: Date;
};

/**
 * Resolve candidate entities for a rule based on its trigger_type.
 * Returns null if the trigger type is not supported or has no source.
 */
async function resolveCandidates(
  client: PoolClient,
  agencyId: string,
  rule: TaskAutomationRule,
  today: Date,
): Promise<CandidateEntity[] | null> {
  const offset = rule.trigger_offset_days ?? 0;

  switch (rule.trigger_type) {
    case "policy_expiration": {
      // policies expiring on today + offset days
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + offset);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const { rows } = await client.query(
        `SELECT
           p.id AS entity_id,
           p.lob,
           p.status AS policy_status,
           a.account_type
         FROM policies p
         LEFT JOIN accounts a ON a.id = p.account_id AND a.agency_id = p.agency_id
         WHERE p.agency_id = $1
           AND p.status = 'active'
           AND p.expiration_date = $2::date`,
        [agencyId, targetStr],
      );

      return rows.map((r) => ({
        entity_type: "policy",
        entity_id: r.entity_id,
        filter_fields: {
          lob: r.lob,
          policy_type: r.lob,
          account_type: r.account_type,
        },
        trigger_date: today,
      }));
    }

    case "account_created": {
      // accounts created offset days ago
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - offset);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const { rows } = await client.query(
        `SELECT id AS entity_id, account_type
         FROM accounts
         WHERE agency_id = $1
           AND created_at::date = $2::date`,
        [agencyId, targetStr],
      );

      return rows.map((r) => ({
        entity_type: "account",
        entity_id: r.entity_id,
        filter_fields: { account_type: r.account_type },
        trigger_date: today,
      }));
    }

    case "deal_won": {
      // deals set to won on today - offset days
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() - offset);
      const targetStr = targetDate.toISOString().slice(0, 10);

      const { rows } = await client.query(
        `SELECT id AS entity_id
         FROM crm_deals
         WHERE agency_id = $1
           AND status = 'won'
           AND updated_at::date = $2::date`,
        [agencyId, targetStr],
      );

      return rows.map((r) => ({
        entity_type: "deal",
        entity_id: r.entity_id,
        filter_fields: {},
        trigger_date: today,
      }));
    }

    case "deal_stage_changed": {
      // No reliable signal without a dedicated stage-change event table.
      // Log and skip for this build.
      return null;
    }

    case "recurring_schedule": {
      if (!rule.recurrence_rule) return [];
      // Expand RRULE and check if today is an occurrence.
      const rangeStart = new Date(today);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(today);
      rangeEnd.setHours(23, 59, 59, 999);

      const occurrences = expandRRule(rule.recurrence_rule, rangeStart, rangeStart, rangeEnd);
      if (occurrences.length === 0) return [];

      // For recurring_schedule, there is no entity — create one task for the rule itself.
      // Use the rule id as a synthetic entity_id so dedup logic still works.
      return [
        {
          entity_type: "rule",
          entity_id: rule.id,
          filter_fields: {},
          trigger_date: today,
        },
      ];
    }

    default:
      return null;
  }
}

/**
 * Check if a candidate entity's fields match all key/value pairs in segment_filters.
 */
function matchesSegmentFilters(
  filterFields: Record<string, unknown>,
  segmentFilters: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(segmentFilters)) {
    if (filterFields[key] !== value) return false;
  }
  return true;
}

/**
 * Resolve the assignee user_id for a role within an agency.
 * Returns null if no user is found (task will be unassigned).
 */
async function resolveAssigneeByRole(
  client: PoolClient,
  agencyId: string,
  role: string | null,
): Promise<string | null> {
  if (!role) return null;
  const { rows } = await client.query(
    `SELECT id FROM users
     WHERE agency_id = $1 AND role = $2 AND status = 'active'
     ORDER BY created_at ASC
     LIMIT 1`,
    [agencyId, role],
  );
  return rows[0]?.id ?? null;
}

/**
 * Evaluate all active automation rules for a single agency.
 * Creates tasks, logs audit events, and records executions.
 *
 * Must be called within an existing transaction (client already has RLS context set).
 */
export async function evaluateRulesForAgency(
  client: PoolClient,
  agencyId: string,
): Promise<RuleEngineResult> {
  const result: RuleEngineResult = { created: 0, skipped: 0, errors: [] };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  // Load all active rules with template data
  const { rows: rules } = await client.query<TaskAutomationRule>(
    `SELECT
       r.*,
       t.name        AS template_name,
       t.description AS template_description,
       t.default_offset_days,
       t.default_assignee_role
     FROM task_automation_rules r
     JOIN task_templates t ON t.id = r.template_id AND t.agency_id = r.agency_id
     WHERE r.agency_id = $1
       AND r.is_active = true
       AND r.deleted_at IS NULL
       AND t.deleted_at IS NULL`,
    [agencyId],
  );

  for (const rule of rules) {
    try {
      const candidates = await resolveCandidates(client, agencyId, rule, today);

      if (candidates === null) {
        // Unsupported trigger — log and skip
        result.errors.push(
          `Rule ${rule.id} (${rule.name}): trigger_type '${rule.trigger_type}' skipped (no source).`,
        );
        continue;
      }

      for (const candidate of candidates) {
        try {
          // Apply segment_filters
          if (
            Object.keys(rule.segment_filters).length > 0 &&
            !matchesSegmentFilters(candidate.filter_fields, rule.segment_filters)
          ) {
            result.skipped++;
            continue;
          }

          // Check dedup: same rule + entity + today
          const { rows: dedupRows } = await client.query(
            `SELECT 1 FROM task_rule_executions
             WHERE rule_id = $1
               AND entity_type = $2
               AND entity_id = $3
               AND execution_date = $4::date
             LIMIT 1`,
            [rule.id, candidate.entity_type, candidate.entity_id, todayStr],
          );

          if (dedupRows.length > 0) {
            result.skipped++;
            continue;
          }

          // Resolve assignee
          const assigneeUserId = await resolveAssigneeByRole(
            client,
            agencyId,
            rule.default_assignee_role,
          );

          // Compute due_date from template offset
          const dueDate = new Date(today);
          if (rule.default_offset_days !== null) {
            dueDate.setDate(dueDate.getDate() + (rule.default_offset_days ?? 0));
          }
          const dueDateStr = dueDate.toISOString().slice(0, 10);

          // Create the task
          const { rows: taskRows } = await client.query(
            `INSERT INTO tasks (
               agency_id,
               title,
               description,
               status,
               due_date,
               assigned_to_user_id,
               linked_entity_type,
               linked_entity_id,
               template_id,
               rule_id
             ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
              agencyId,
              rule.template_name,
              rule.template_description ?? null,
              dueDateStr,
              assigneeUserId,
              candidate.entity_type === "rule" ? null : candidate.entity_type,
              candidate.entity_type === "rule" ? null : candidate.entity_id,
              rule.template_id,
              rule.id,
            ],
          );

          const task = taskRows[0];

          // Record execution
          await client.query(
            `INSERT INTO task_rule_executions
               (agency_id, rule_id, entity_type, entity_id, task_id, execution_date)
             VALUES ($1, $2, $3, $4, $5, $6::date)`,
            [
              agencyId,
              rule.id,
              candidate.entity_type,
              candidate.entity_id,
              task.id,
              todayStr,
            ],
          );

          // Update rule.last_run_at
          await client.query(
            `UPDATE task_automation_rules SET last_run_at = now() WHERE id = $1`,
            [rule.id],
          );

          await logAudit(client, {
            agencyId,
            actorUserId: null,
            action: "task.created_by_rule",
            entityType: "task",
            entityId: task.id,
            afterJson: { task, rule_id: rule.id, entity_type: candidate.entity_type, entity_id: candidate.entity_id },
          });

          await emitEvent(client, {
            agencyId,
            eventType: "task.created_by_rule",
            entityType: "task",
            entityId: task.id,
            metaJson: {
              rule_id: rule.id,
              template_id: rule.template_id,
              trigger_type: rule.trigger_type,
              entity_type: candidate.entity_type,
              entity_id: candidate.entity_id,
            },
          });

          result.created++;
        } catch (candidateErr) {
          result.errors.push(
            `Rule ${rule.id} candidate ${candidate.entity_id}: ${candidateErr instanceof Error ? candidateErr.message : String(candidateErr)}`,
          );
        }
      }
    } catch (ruleErr) {
      result.errors.push(
        `Rule ${rule.id} (${rule.name}): ${ruleErr instanceof Error ? ruleErr.message : String(ruleErr)}`,
      );
    }
  }

  return result;
}
