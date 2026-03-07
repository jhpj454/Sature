import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  assertCrmUser,
  CRM_FORECAST_CATEGORIES,
  CRM_STAGE_TYPES,
  ForbiddenError,
  getVisiblePipeline,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const createStageSchema = z.object({
  name: z.string().trim().min(1),
  stage_type: z.enum(CRM_STAGE_TYPES).default("open"),
  probability_pct: z.coerce.number().int().min(0).max(100),
  forecast_category: z.enum(CRM_FORECAST_CATEGORIES),
  description: z.string().trim().nullable().optional(),
  required_fields_json: z.record(z.string(), z.unknown()).nullable().optional(),
  sort_order: z.coerce.number().int().min(1).optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid pipeline id.");
    }

    const stages = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const pipeline = await getVisiblePipeline(client, session.agency_id, id, session);
      if (!pipeline) return null;

      const result = await client.query(
        `
          SELECT *
          FROM crm_pipeline_stages
          WHERE agency_id = $1
            AND pipeline_id = $2
          ORDER BY sort_order ASC, created_at ASC
        `,
        [session.agency_id, id],
      );

      return result.rows;
    });

    if (!stages) {
      return jsonError(404, "Pipeline not found.");
    }

    return NextResponse.json({ ok: true, data: stages });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/pipelines/[id]/stages failed", error);
    return jsonError(500, "Unable to load stages.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid pipeline id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = createStageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const pipeline = await getVisiblePipeline(client, session.agency_id, id, session, {
        forUpdate: true,
        editableOnly: true,
      });
      if (!pipeline) {
        return { error: "Pipeline not found." as const };
      }

      const countRes = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM crm_pipeline_stages
          WHERE agency_id = $1
            AND pipeline_id = $2
        `,
        [session.agency_id, id],
      );
      const stageCount = Number(countRes.rows[0]?.count ?? "0");
      const sortOrder = parsed.data.sort_order ?? stageCount + 1;

      await client.query(
        `
          UPDATE crm_pipeline_stages
          SET sort_order = sort_order + 1
          WHERE agency_id = $1
            AND pipeline_id = $2
            AND sort_order >= $3
        `,
        [session.agency_id, id, sortOrder],
      );

      const insertRes = await client.query(
        `
          INSERT INTO crm_pipeline_stages (
            agency_id,
            pipeline_id,
            name,
            stage_type,
            probability_pct,
            forecast_category,
            description,
            required_fields_json,
            sort_order
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          session.agency_id,
          id,
          parsed.data.name,
          parsed.data.stage_type,
          parsed.data.probability_pct,
          parsed.data.forecast_category,
          parsed.data.description ?? null,
          parsed.data.required_fields_json ? JSON.stringify(parsed.data.required_fields_json) : null,
          sortOrder,
        ],
      );

      const stage = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.pipeline_stage.create",
        entityType: "crm_pipeline_stage",
        entityId: stage.id,
        afterJson: stage,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.pipeline_stage.created",
        entityType: "crm_pipeline_stage",
        entityId: stage.id,
        metaJson: {
          pipeline_id: id,
          name: stage.name,
          stage_type: stage.stage_type,
          sort_order: stage.sort_order,
        },
      });

      return { data: stage };
    });

    if ("error" in created) {
      return jsonError(404, created.error ?? "Pipeline not found.");
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/pipelines/[id]/stages failed", error);
    return jsonError(500, "Unable to create stage.");
  }
}
