import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  CRM_PIPELINE_VISIBILITY,
  DEFAULT_PIPELINE_STAGES,
  ForbiddenError,
  insertDefaultPipelineStages,
  isCrmAdmin,
  pipelineVisibilitySql,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  visibility_type: z.enum(CRM_PIPELINE_VISIBILITY).optional(),
  is_active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const createPipelineSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  visibility_type: z.enum(CRM_PIPELINE_VISIBILITY).default("private"),
  owner_user_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().default(true),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      visibility_type: request.nextUrl.searchParams.get("visibility_type") ?? undefined,
      is_active: request.nextUrl.searchParams.get("is_active") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const { q, visibility_type, is_active, page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const isAdmin = isCrmAdmin(session);
      const visibilitySql = pipelineVisibilitySql("p", "$2", "$3");

      const rowsRes = await client.query(
        `
          SELECT
            p.*,
            owner_user.display_name AS owner_display_name,
            COUNT(stage.id)::int AS stage_count
          FROM crm_pipelines p
          LEFT JOIN users owner_user
            ON owner_user.id = p.owner_user_id
           AND owner_user.agency_id = p.agency_id
          LEFT JOIN crm_pipeline_stages stage
            ON stage.pipeline_id = p.id
           AND stage.agency_id = p.agency_id
          WHERE p.agency_id = $1
            AND ${visibilitySql}
            AND ($4::text IS NULL OR p.visibility_type = $4)
            AND ($5::boolean IS NULL OR p.is_active = $5)
            AND ($6::text IS NULL OR p.name ILIKE '%' || $6 || '%' OR p.description ILIKE '%' || $6 || '%')
          GROUP BY p.id, owner_user.display_name
          ORDER BY p.updated_at DESC, p.created_at DESC
          LIMIT $7 OFFSET $8
        `,
        [
          session.agency_id,
          isAdmin,
          session.user_id,
          visibility_type ?? null,
          is_active === undefined ? null : is_active === "true",
          q ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM crm_pipelines p
          WHERE p.agency_id = $1
            AND ${visibilitySql}
            AND ($4::text IS NULL OR p.visibility_type = $4)
            AND ($5::boolean IS NULL OR p.is_active = $5)
            AND ($6::text IS NULL OR p.name ILIKE '%' || $6 || '%' OR p.description ILIKE '%' || $6 || '%')
        `,
        [
          session.agency_id,
          isAdmin,
          session.user_id,
          visibility_type ?? null,
          is_active === undefined ? null : is_active === "true",
          q ?? null,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: result.rows,
      pagination: {
        page,
        page_size,
        total: result.total,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError(401, "Unauthorized");
    }
    if (error instanceof ForbiddenError) {
      return jsonError(403, "Forbidden");
    }
    console.error("GET /api/crm/pipelines failed", error);
    return jsonError(500, "Unable to load pipelines.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createPipelineSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const ownerUserId = parsed.data.owner_user_id ?? session.user_id;
      if (["private", "team"].includes(parsed.data.visibility_type) && !ownerUserId) {
        return { error: "Owner is required for private or team pipelines." as const };
      }

      if (ownerUserId) {
        const ownerExists = await activeAgencyUserExists(
          client,
          ownerUserId,
          session.agency_id,
          ["producer", "admin"],
        );
        if (!ownerExists) {
          return { error: "Pipeline owner not found." as const };
        }
      }

      const insertRes = await client.query(
        `
          INSERT INTO crm_pipelines (
            agency_id,
            name,
            description,
            visibility_type,
            owner_user_id,
            team_id,
            is_active,
            created_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.name,
          parsed.data.description ?? null,
          parsed.data.visibility_type,
          ownerUserId,
          parsed.data.team_id ?? null,
          parsed.data.is_active,
          session.user_id,
        ],
      );

      const pipeline = insertRes.rows[0];
      const stages = await insertDefaultPipelineStages(client, session.agency_id, pipeline.id);

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.pipeline.create",
        entityType: "crm_pipeline",
        entityId: pipeline.id,
        afterJson: pipeline,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.pipeline.created",
        entityType: "crm_pipeline",
        entityId: pipeline.id,
        metaJson: {
          visibility_type: pipeline.visibility_type,
          owner_user_id: pipeline.owner_user_id,
          default_stage_count: DEFAULT_PIPELINE_STAGES.length,
        },
      });

      for (const stage of stages) {
        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "crm.pipeline_stage.create",
          entityType: "crm_pipeline_stage",
          entityId: String(stage.id),
          afterJson: stage,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "crm.pipeline_stage.created",
          entityType: "crm_pipeline_stage",
          entityId: String(stage.id),
          metaJson: {
            pipeline_id: pipeline.id,
            name: stage.name,
            stage_type: stage.stage_type,
            sort_order: stage.sort_order,
          },
        });
      }

      return { data: { ...pipeline, stages } };
    });

    if ("error" in created) {
      return jsonError(400, created.error ?? "Unable to create pipeline.");
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError(401, "Unauthorized");
    }
    if (error instanceof ForbiddenError) {
      return jsonError(403, "Forbidden");
    }
    console.error("POST /api/crm/pipelines failed", error);
    return jsonError(500, "Unable to create pipeline.");
  }
}
