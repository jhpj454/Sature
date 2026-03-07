import type { PoolClient } from "pg";
import type { SessionContext } from "@/src/server/tenant";

export const CRM_PIPELINE_VISIBILITY = ["private", "team", "agency"] as const;
export const CRM_STAGE_TYPES = ["open", "won", "lost"] as const;
export const CRM_FORECAST_CATEGORIES = [
  "pipeline",
  "best_case",
  "commit",
  "closed",
  "omitted",
] as const;
export const CRM_DEAL_STATUSES = ["open", "won", "lost", "archived"] as const;
export const CRM_LEAD_ASSIGNMENT_STATUSES = ["unassigned", "assigned", "claimed"] as const;
export const CRM_LEAD_STATUSES = [
  "new",
  "working",
  "qualified",
  "converted",
  "lost",
  "archived",
] as const;

export type CrmVisibilityType = (typeof CRM_PIPELINE_VISIBILITY)[number];
export type CrmStageType = (typeof CRM_STAGE_TYPES)[number];
export type CrmForecastCategory = (typeof CRM_FORECAST_CATEGORIES)[number];
export type CrmDealStatus = (typeof CRM_DEAL_STATUSES)[number];
export type CrmLeadAssignmentStatus = (typeof CRM_LEAD_ASSIGNMENT_STATUSES)[number];
export type CrmLeadStatus = (typeof CRM_LEAD_STATUSES)[number];

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export const DEFAULT_PIPELINE_STAGES: Array<{
  name: string;
  stage_type: CrmStageType;
  probability_pct: number;
  forecast_category: CrmForecastCategory;
}> = [
  { name: "Lead", stage_type: "open", probability_pct: 10, forecast_category: "pipeline" },
  { name: "Qualified", stage_type: "open", probability_pct: 25, forecast_category: "pipeline" },
  {
    name: "Marketing to Carriers",
    stage_type: "open",
    probability_pct: 40,
    forecast_category: "best_case",
  },
  {
    name: "Quotes Received",
    stage_type: "open",
    probability_pct: 60,
    forecast_category: "best_case",
  },
  {
    name: "Proposal Sent",
    stage_type: "open",
    probability_pct: 75,
    forecast_category: "commit",
  },
  {
    name: "Decision Pending",
    stage_type: "open",
    probability_pct: 90,
    forecast_category: "commit",
  },
  { name: "Bound", stage_type: "won", probability_pct: 100, forecast_category: "closed" },
  { name: "Lost", stage_type: "lost", probability_pct: 0, forecast_category: "omitted" },
];

export function assertCrmUser(session: SessionContext) {
  if (session.role !== "producer" && session.role !== "admin") {
    throw new ForbiddenError();
  }
}

export function isCrmAdmin(session: SessionContext) {
  return session.role === "admin";
}

export function mapDealStatusFromStageType(stageType: string): CrmDealStatus {
  if (stageType === "won") return "won";
  if (stageType === "lost") return "lost";
  return "open";
}

export function deriveLeadAssignmentStatus(assignedProducerId: string | null | undefined) {
  return assignedProducerId ? "assigned" : "unassigned";
}

export async function activeAgencyUserExists(
  client: PoolClient,
  userId: string,
  agencyId: string,
  allowedRoles?: string[],
) {
  const params: unknown[] = [userId, agencyId];
  const roleClause =
    allowedRoles && allowedRoles.length > 0
      ? ` AND role::text = ANY($${params.push(allowedRoles)}::text[])`
      : "";

  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND agency_id = $2
        AND status = 'active'
        ${roleClause}
      LIMIT 1
    `,
    params,
  );

  return (result.rowCount ?? 0) > 0;
}

export function pipelineVisibilitySql(alias: string, isAdminParam: string, userIdParam: string) {
  return `(
    ${isAdminParam}::boolean = true
    OR ${alias}.visibility_type = 'agency'
    OR ${alias}.owner_user_id = ${userIdParam}::uuid
    OR (${alias}.visibility_type = 'team' AND ${alias}.owner_user_id = ${userIdParam}::uuid)
  )`;
}

export function pipelineEditableSql(alias: string, isAdminParam: string, userIdParam: string) {
  return `(
    ${isAdminParam}::boolean = true
    OR ${alias}.owner_user_id = ${userIdParam}::uuid
  )`;
}

export async function insertDefaultPipelineStages(
  client: PoolClient,
  agencyId: string,
  pipelineId: string,
) {
  const inserted: Array<Record<string, unknown>> = [];

  for (const [index, stage] of DEFAULT_PIPELINE_STAGES.entries()) {
    const result = await client.query(
      `
        INSERT INTO crm_pipeline_stages (
          agency_id,
          pipeline_id,
          name,
          stage_type,
          probability_pct,
          forecast_category,
          sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        agencyId,
        pipelineId,
        stage.name,
        stage.stage_type,
        stage.probability_pct,
        stage.forecast_category,
        index + 1,
      ],
    );

    inserted.push(result.rows[0]);
  }

  return inserted;
}

export async function getVisiblePipeline(
  client: PoolClient,
  agencyId: string,
  pipelineId: string,
  session: SessionContext,
  options?: { forUpdate?: boolean; editableOnly?: boolean },
) {
  const isAdmin = isCrmAdmin(session);
  const permissionSql = options?.editableOnly
    ? pipelineEditableSql("p", "$3", "$4")
    : pipelineVisibilitySql("p", "$3", "$4");
  const lockSql = options?.forUpdate ? "FOR UPDATE" : "";

  const result = await client.query(
    `
      SELECT p.*
      FROM crm_pipelines p
      WHERE p.id = $1
        AND p.agency_id = $2
        AND ${permissionSql}
      LIMIT 1
      ${lockSql}
    `,
    [pipelineId, agencyId, isAdmin, session.user_id],
  );

  return result.rows[0] ?? null;
}

export async function getStageForPipeline(
  client: PoolClient,
  agencyId: string,
  pipelineId: string,
  stageId: string,
  forUpdate = false,
) {
  const result = await client.query(
    `
      SELECT *
      FROM crm_pipeline_stages
      WHERE id = $1
        AND agency_id = $2
        AND pipeline_id = $3
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [stageId, agencyId, pipelineId],
  );

  return result.rows[0] ?? null;
}

export async function getStageById(
  client: PoolClient,
  agencyId: string,
  stageId: string,
  forUpdate = false,
) {
  const result = await client.query(
    `
      SELECT *
      FROM crm_pipeline_stages
      WHERE id = $1
        AND agency_id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [stageId, agencyId],
  );

  return result.rows[0] ?? null;
}

export async function getVisibleDeal(
  client: PoolClient,
  agencyId: string,
  dealId: string,
  session: SessionContext,
  options?: { forUpdate?: boolean; editableOnly?: boolean },
) {
  const isAdmin = isCrmAdmin(session);
  const permissionSql = options?.editableOnly
    ? pipelineEditableSql("p", "$3", "$4")
    : pipelineVisibilitySql("p", "$3", "$4");
  const lockSql = options?.forUpdate ? "FOR UPDATE OF d" : "";

  const result = await client.query(
    `
      SELECT d.*
      FROM crm_deals d
      JOIN crm_pipelines p
        ON p.id = d.pipeline_id
       AND p.agency_id = d.agency_id
      WHERE d.id = $1
        AND d.agency_id = $2
        AND ${permissionSql}
      LIMIT 1
      ${lockSql}
    `,
    [dealId, agencyId, isAdmin, session.user_id],
  );

  return result.rows[0] ?? null;
}

export async function getLeadById(
  client: PoolClient,
  agencyId: string,
  leadId: string,
  forUpdate = false,
) {
  const result = await client.query(
    `
      SELECT l.*
      FROM crm_leads l
      WHERE l.id = $1
        AND l.agency_id = $2
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [leadId, agencyId],
  );

  return result.rows[0] ?? null;
}
