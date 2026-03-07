import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  CRM_PIPELINE_VISIBILITY,
  ForbiddenError,
  getVisiblePipeline,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updatePipelineSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    visibility_type: z.enum(CRM_PIPELINE_VISIBILITY).optional(),
    owner_user_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
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

    const pipeline = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const visible = await getVisiblePipeline(client, session.agency_id, id, session);
      if (!visible) return null;

      const stageCountRes = await client.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM crm_pipeline_stages
          WHERE agency_id = $1
            AND pipeline_id = $2
        `,
        [session.agency_id, id],
      );

      return {
        ...visible,
        stage_count: Number(stageCountRes.rows[0]?.count ?? "0"),
      };
    });

    if (!pipeline) {
      return jsonError(404, "Pipeline not found.");
    }

    return NextResponse.json({ ok: true, data: pipeline });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/pipelines/[id] failed", error);
    return jsonError(500, "Unable to load pipeline.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid pipeline id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updatePipelineSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const before = await getVisiblePipeline(client, session.agency_id, id, session, {
        forUpdate: true,
        editableOnly: true,
      });

      if (!before) {
        return { error: "Pipeline not found." as const };
      }

      const nextVisibility = parsed.data.visibility_type ?? before.visibility_type;
      const nextOwner =
        parsed.data.owner_user_id !== undefined ? parsed.data.owner_user_id : before.owner_user_id;

      if (["private", "team"].includes(nextVisibility) && !nextOwner) {
        return { error: "Owner is required for private or team pipelines." as const };
      }

      if (nextOwner) {
        const ownerExists = await activeAgencyUserExists(
          client,
          nextOwner,
          session.agency_id,
          ["producer", "admin"],
        );
        if (!ownerExists) {
          return { error: "Pipeline owner not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE crm_pipelines
          SET
            name = $2,
            description = $3,
            visibility_type = $4,
            owner_user_id = $5,
            team_id = $6,
            is_active = $7
          WHERE id = $1
            AND agency_id = $8
          RETURNING *
        `,
        [
          id,
          parsed.data.name ?? before.name,
          parsed.data.description !== undefined ? parsed.data.description : before.description,
          nextVisibility,
          nextOwner ?? null,
          parsed.data.team_id !== undefined ? parsed.data.team_id : before.team_id,
          parsed.data.is_active ?? before.is_active,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.pipeline.update",
        entityType: "crm_pipeline",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.pipeline.updated",
        entityType: "crm_pipeline",
        entityId: id,
        metaJson: {
          visibility_type: after.visibility_type,
          owner_user_id: after.owner_user_id,
          is_active: after.is_active,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const message = updated.error ?? "Unable to update pipeline.";
      return jsonError(message === "Pipeline not found." ? 404 : 400, message);
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/pipelines/[id] failed", error);
    return jsonError(500, "Unable to update pipeline.");
  }
}
