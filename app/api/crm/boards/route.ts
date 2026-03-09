import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCrmUser,
  ForbiddenError,
  isCrmAdmin,
  pipelineVisibilitySql,
} from "@/src/server/crm";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const pipelineIdParam = request.nextUrl.searchParams.get("pipeline_id") ?? undefined;
    const pipelineId =
      pipelineIdParam && z.uuid().safeParse(pipelineIdParam).success
        ? pipelineIdParam
        : undefined;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const isAdmin = isCrmAdmin(session);
      const visibilitySql = pipelineVisibilitySql("p", "$2", "$3");

      // Fetch all visible pipelines for this agency
      const pipelinesRes = await client.query(
        `
          SELECT p.id, p.name
          FROM crm_pipelines p
          WHERE p.agency_id = $1
            AND ${visibilitySql}
          ORDER BY p.created_at ASC
        `,
        [session.agency_id, isAdmin, session.user_id],
      );
      const pipelines = pipelinesRes.rows;

      if (pipelines.length === 0) {
        return { pipelines: [], selected_pipeline_id: null, stages: [] };
      }

      const selectedPipelineId =
        pipelineId && pipelines.some((p: { id: string }) => p.id === pipelineId)
          ? pipelineId
          : pipelines[0].id;

      // Fetch stages for the selected pipeline ordered by sort_order
      const stagesRes = await client.query(
        `
          SELECT id, name, sort_order, stage_type
          FROM crm_pipeline_stages
          WHERE pipeline_id = $1
            AND agency_id = $2
          ORDER BY sort_order ASC
        `,
        [selectedPipelineId, session.agency_id],
      );
      const stages = stagesRes.rows;

      if (stages.length === 0) {
        return { pipelines, selected_pipeline_id: selectedPipelineId, stages: [] };
      }

      // Fetch all open deals for the selected pipeline
      const dealsRes = await client.query(
        `
          SELECT
            d.id,
            d.name,
            d.estimated_revenue,
            d.expected_close_date,
            d.account_id,
            d.pipeline_stage_id,
            a.account_name
          FROM crm_deals d
          LEFT JOIN accounts a
            ON a.id = d.account_id
           AND a.agency_id = d.agency_id
          WHERE d.agency_id = $1
            AND d.pipeline_id = $2
            AND d.status = 'open'
          ORDER BY d.created_at ASC
        `,
        [session.agency_id, selectedPipelineId],
      );

      // Group deals by stage id in JS
      type DealRow = {
        id: string;
        name: string;
        estimated_revenue: string;
        expected_close_date: string | null;
        account_id: string | null;
        pipeline_stage_id: string;
        account_name: string | null;
      };
      const dealsByStage = new Map<string, DealRow[]>();
      for (const deal of dealsRes.rows as DealRow[]) {
        const existing = dealsByStage.get(deal.pipeline_stage_id) ?? [];
        existing.push(deal);
        dealsByStage.set(deal.pipeline_stage_id, existing);
      }

      const stagesWithDeals = stages.map((stage: { id: string; name: string; sort_order: number; stage_type: string }) => ({
        ...stage,
        deals: dealsByStage.get(stage.id) ?? [],
      }));

      return { pipelines, selected_pipeline_id: selectedPipelineId, stages: stagesWithDeals };
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/boards failed", error);
    return jsonError(500, "Unable to load board.");
  }
}
