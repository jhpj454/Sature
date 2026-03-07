import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  assertCrmUser,
  CRM_FORECAST_CATEGORIES,
  CRM_STAGE_TYPES,
  ForbiddenError,
  getStageForPipeline,
  getVisiblePipeline,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string; stageId: string }>;
};

const updateStageSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    stage_type: z.enum(CRM_STAGE_TYPES).optional(),
    probability_pct: z.coerce.number().int().min(0).max(100).optional(),
    forecast_category: z.enum(CRM_FORECAST_CATEGORIES).optional(),
    description: z.string().trim().nullable().optional(),
    required_fields_json: z.record(z.string(), z.unknown()).nullable().optional(),
    sort_order: z.coerce.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id, stageId } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(stageId).success) {
      return jsonError(400, "Invalid stage id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateStageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const pipeline = await getVisiblePipeline(client, session.agency_id, id, session, {
        forUpdate: true,
        editableOnly: true,
      });
      if (!pipeline) {
        return { error: "Pipeline not found." as const };
      }

      const before = await getStageForPipeline(client, session.agency_id, id, stageId, true);
      if (!before) {
        return { error: "Stage not found." as const };
      }

      const nextSortOrder = parsed.data.sort_order ?? before.sort_order;
      if (nextSortOrder !== before.sort_order) {
        if (nextSortOrder > before.sort_order) {
          await client.query(
            `
              UPDATE crm_pipeline_stages
              SET sort_order = sort_order - 1
              WHERE agency_id = $1
                AND pipeline_id = $2
                AND sort_order > $3
                AND sort_order <= $4
            `,
            [session.agency_id, id, before.sort_order, nextSortOrder],
          );
        } else {
          await client.query(
            `
              UPDATE crm_pipeline_stages
              SET sort_order = sort_order + 1
              WHERE agency_id = $1
                AND pipeline_id = $2
                AND sort_order >= $3
                AND sort_order < $4
            `,
            [session.agency_id, id, nextSortOrder, before.sort_order],
          );
        }
      }

      const updateRes = await client.query(
        `
          UPDATE crm_pipeline_stages
          SET
            name = $2,
            stage_type = $3,
            probability_pct = $4,
            forecast_category = $5,
            description = $6,
            required_fields_json = $7,
            sort_order = $8
          WHERE id = $1
            AND agency_id = $9
          RETURNING *
        `,
        [
          stageId,
          parsed.data.name ?? before.name,
          parsed.data.stage_type ?? before.stage_type,
          parsed.data.probability_pct ?? before.probability_pct,
          parsed.data.forecast_category ?? before.forecast_category,
          parsed.data.description !== undefined ? parsed.data.description : before.description,
          parsed.data.required_fields_json !== undefined
            ? parsed.data.required_fields_json
              ? JSON.stringify(parsed.data.required_fields_json)
              : null
            : before.required_fields_json,
          nextSortOrder,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.pipeline_stage.update",
        entityType: "crm_pipeline_stage",
        entityId: stageId,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.pipeline_stage.updated",
        entityType: "crm_pipeline_stage",
        entityId: stageId,
        metaJson: {
          pipeline_id: id,
          stage_type: after.stage_type,
          sort_order: after.sort_order,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const message = updated.error ?? "Unable to update stage.";
      const status = message === "Pipeline not found." || message === "Stage not found." ? 404 : 400;
      return jsonError(status, message);
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/pipelines/[id]/stages/[stageId] failed", error);
    return jsonError(500, "Unable to update stage.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, stageId } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(stageId).success) {
      return jsonError(400, "Invalid stage id.");
    }

    const deleted = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const pipeline = await getVisiblePipeline(client, session.agency_id, id, session, {
        forUpdate: true,
        editableOnly: true,
      });
      if (!pipeline) {
        return { error: "Pipeline not found." as const };
      }

      const before = await getStageForPipeline(client, session.agency_id, id, stageId, true);
      if (!before) {
        return { error: "Stage not found." as const };
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
      if (Number(countRes.rows[0]?.count ?? "0") <= 1) {
        return { error: "Pipeline must have at least one stage." as const };
      }

      const usageRes = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM crm_deals
          WHERE agency_id = $1
            AND pipeline_stage_id = $2
        `,
        [session.agency_id, stageId],
      );
      if (Number(usageRes.rows[0]?.count ?? "0") > 0) {
        return { error: "Stage is in use and cannot be deleted." as const };
      }

      await client.query(
        `
          DELETE FROM crm_pipeline_stages
          WHERE id = $1
            AND agency_id = $2
        `,
        [stageId, session.agency_id],
      );

      await client.query(
        `
          UPDATE crm_pipeline_stages
          SET sort_order = sort_order - 1
          WHERE agency_id = $1
            AND pipeline_id = $2
            AND sort_order > $3
        `,
        [session.agency_id, id, before.sort_order],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.pipeline_stage.delete",
        entityType: "crm_pipeline_stage",
        entityId: stageId,
        beforeJson: before,
        afterJson: null,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.pipeline_stage.deleted",
        entityType: "crm_pipeline_stage",
        entityId: stageId,
        metaJson: {
          pipeline_id: id,
          name: before.name,
        },
      });

      return { data: before };
    });

    if ("error" in deleted) {
      const statusMap: Record<string, number> = {
        "Pipeline not found.": 404,
        "Stage not found.": 404,
        "Pipeline must have at least one stage.": 400,
        "Stage is in use and cannot be deleted.": 409,
      };
      const message = deleted.error ?? "Unable to delete stage.";
      return jsonError(statusMap[message] ?? 400, message);
    }

    return NextResponse.json({ ok: true, data: deleted.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("DELETE /api/crm/pipelines/[id]/stages/[stageId] failed", error);
    return jsonError(500, "Unable to delete stage.");
  }
}
