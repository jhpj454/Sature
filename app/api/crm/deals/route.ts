import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  CRM_DEAL_STATUSES,
  ForbiddenError,
  getStageById,
  getVisiblePipeline,
  isCrmAdmin,
  mapDealStatusFromStageType,
  pipelineVisibilitySql,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listDealsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  pipeline_id: z.string().uuid().optional(),
  pipeline_stage_id: z.string().uuid().optional(),
  status: z.enum(CRM_DEAL_STATUSES).optional(),
  producer_user_id: z.string().uuid().optional(),
  expected_close_from: isoDateSchema.optional(),
  expected_close_to: isoDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const createDealSchema = z.object({
  pipeline_id: z.string().uuid(),
  pipeline_stage_id: z.string().uuid(),
  account_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  producer_user_id: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1),
  estimated_revenue: z.coerce.number().min(0),
  estimated_premium: z.coerce.number().min(0).nullable().optional(),
  estimated_commission_pct: z.coerce.number().min(0).max(1).nullable().optional(),
  expected_close_date: isoDateSchema.nullable().optional(),
  next_step: z.string().trim().nullable().optional(),
  next_step_due_at: z.string().trim().nullable().optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listDealsQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      pipeline_id: request.nextUrl.searchParams.get("pipeline_id") ?? undefined,
      pipeline_stage_id: request.nextUrl.searchParams.get("pipeline_stage_id") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      producer_user_id: request.nextUrl.searchParams.get("producer_user_id") ?? undefined,
      expected_close_from:
        request.nextUrl.searchParams.get("expected_close_from") ?? undefined,
      expected_close_to: request.nextUrl.searchParams.get("expected_close_to") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const {
      q,
      pipeline_id,
      pipeline_stage_id,
      status,
      producer_user_id,
      expected_close_from,
      expected_close_to,
      page,
      page_size,
    } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const isAdmin = isCrmAdmin(session);
      const visibilitySql = pipelineVisibilitySql("p", "$2", "$3");

      const rowsRes = await client.query(
        `
          SELECT
            d.*,
            p.name AS pipeline_name,
            stage.name AS stage_name,
            stage.stage_type,
            a.account_name,
            producer.display_name AS producer_display_name
          FROM crm_deals d
          JOIN crm_pipelines p
            ON p.id = d.pipeline_id
           AND p.agency_id = d.agency_id
          JOIN crm_pipeline_stages stage
            ON stage.id = d.pipeline_stage_id
           AND stage.agency_id = d.agency_id
          LEFT JOIN accounts a
            ON a.id = d.account_id
           AND a.agency_id = d.agency_id
          LEFT JOIN users producer
            ON producer.id = d.producer_user_id
           AND producer.agency_id = d.agency_id
          WHERE d.agency_id = $1
            AND ${visibilitySql}
            AND ($4::uuid IS NULL OR d.pipeline_id = $4)
            AND ($5::uuid IS NULL OR d.pipeline_stage_id = $5)
            AND ($6::text IS NULL OR d.status = $6)
            AND ($7::uuid IS NULL OR d.producer_user_id = $7)
            AND ($8::date IS NULL OR d.expected_close_date >= $8)
            AND ($9::date IS NULL OR d.expected_close_date <= $9)
            AND ($10::text IS NULL OR d.name ILIKE '%' || $10 || '%' OR COALESCE(a.account_name, '') ILIKE '%' || $10 || '%')
          ORDER BY d.updated_at DESC, d.created_at DESC
          LIMIT $11 OFFSET $12
        `,
        [
          session.agency_id,
          isAdmin,
          session.user_id,
          pipeline_id ?? null,
          pipeline_stage_id ?? null,
          status ?? null,
          producer_user_id ?? null,
          expected_close_from ?? null,
          expected_close_to ?? null,
          q ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM crm_deals d
          JOIN crm_pipelines p
            ON p.id = d.pipeline_id
           AND p.agency_id = d.agency_id
          LEFT JOIN accounts a
            ON a.id = d.account_id
           AND a.agency_id = d.agency_id
          WHERE d.agency_id = $1
            AND ${visibilitySql}
            AND ($4::uuid IS NULL OR d.pipeline_id = $4)
            AND ($5::uuid IS NULL OR d.pipeline_stage_id = $5)
            AND ($6::text IS NULL OR d.status = $6)
            AND ($7::uuid IS NULL OR d.producer_user_id = $7)
            AND ($8::date IS NULL OR d.expected_close_date >= $8)
            AND ($9::date IS NULL OR d.expected_close_date <= $9)
            AND ($10::text IS NULL OR d.name ILIKE '%' || $10 || '%' OR COALESCE(a.account_name, '') ILIKE '%' || $10 || '%')
        `,
        [
          session.agency_id,
          isAdmin,
          session.user_id,
          pipeline_id ?? null,
          pipeline_stage_id ?? null,
          status ?? null,
          producer_user_id ?? null,
          expected_close_from ?? null,
          expected_close_to ?? null,
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
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/deals failed", error);
    return jsonError(500, "Unable to load deals.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createDealSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const pipeline = await getVisiblePipeline(client, session.agency_id, parsed.data.pipeline_id, session);
      if (!pipeline) {
        return { error: "Pipeline not found." as const };
      }

      const stage = await getStageById(client, session.agency_id, parsed.data.pipeline_stage_id);
      if (!stage || stage.pipeline_id !== parsed.data.pipeline_id) {
        return { error: "Pipeline stage not found." as const };
      }

      const producerUserId = parsed.data.producer_user_id ?? session.user_id;
      const producerExists = await activeAgencyUserExists(
        client,
        producerUserId,
        session.agency_id,
        ["producer", "admin"],
      );
      if (!producerExists) {
        return { error: "Producer not found." as const };
      }

      const status = mapDealStatusFromStageType(stage.stage_type);
      const insertRes = await client.query(
        `
          INSERT INTO crm_deals (
            agency_id,
            pipeline_id,
            pipeline_stage_id,
            account_id,
            lead_id,
            producer_user_id,
            name,
            estimated_revenue,
            estimated_premium,
            estimated_commission_pct,
            expected_close_date,
            next_step,
            next_step_due_at,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.pipeline_id,
          parsed.data.pipeline_stage_id,
          parsed.data.account_id ?? null,
          parsed.data.lead_id ?? null,
          producerUserId,
          parsed.data.name,
          parsed.data.estimated_revenue,
          parsed.data.estimated_premium ?? null,
          parsed.data.estimated_commission_pct ?? null,
          parsed.data.expected_close_date ?? null,
          parsed.data.next_step ?? null,
          parsed.data.next_step_due_at ?? null,
          status,
        ],
      );

      const deal = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.deal.create",
        entityType: "crm_deal",
        entityId: deal.id,
        afterJson: deal,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.deal.created",
        entityType: "crm_deal",
        entityId: deal.id,
        metaJson: {
          pipeline_id: deal.pipeline_id,
          pipeline_stage_id: deal.pipeline_stage_id,
          status: deal.status,
          estimated_revenue: deal.estimated_revenue,
        },
      });

      return { data: deal };
    });

    if ("error" in created) {
      const statusMap: Record<string, number> = {
        "Pipeline not found.": 404,
        "Pipeline stage not found.": 404,
        "Producer not found.": 400,
      };
      const message = created.error ?? "Unable to create deal.";
      return jsonError(statusMap[message] ?? 400, message);
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/deals failed", error);
    return jsonError(500, "Unable to create deal.");
  }
}
