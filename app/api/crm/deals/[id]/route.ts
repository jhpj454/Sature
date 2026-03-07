import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  CRM_DEAL_STATUSES,
  ForbiddenError,
  getStageById,
  getVisibleDeal,
  mapDealStatusFromStageType,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const updateDealSchema = z
  .object({
    pipeline_stage_id: z.string().uuid().optional(),
    account_id: z.string().uuid().nullable().optional(),
    lead_id: z.string().uuid().nullable().optional(),
    producer_user_id: z.string().uuid().nullable().optional(),
    name: z.string().trim().min(1).optional(),
    estimated_revenue: z.coerce.number().min(0).optional(),
    estimated_premium: z.coerce.number().min(0).nullable().optional(),
    estimated_commission_pct: z.coerce.number().min(0).max(1).nullable().optional(),
    expected_close_date: isoDateSchema.nullable().optional(),
    next_step: z.string().trim().nullable().optional(),
    next_step_due_at: z.string().trim().nullable().optional(),
    status: z.enum(CRM_DEAL_STATUSES).optional(),
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
      return jsonError(400, "Invalid deal id.");
    }

    const deal = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const visible = await getVisibleDeal(client, session.agency_id, id, session);
      if (!visible) return null;

      const detailRes = await client.query(
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
          WHERE d.id = $1
            AND d.agency_id = $2
          LIMIT 1
        `,
        [id, session.agency_id],
      );

      return detailRes.rows[0] ?? null;
    });

    if (!deal) {
      return jsonError(404, "Deal not found.");
    }

    return NextResponse.json({ ok: true, data: deal });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/deals/[id] failed", error);
    return jsonError(500, "Unable to load deal.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid deal id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateDealSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const before = await getVisibleDeal(client, session.agency_id, id, session, { forUpdate: true });
      if (!before) {
        return { error: "Deal not found." as const };
      }

      const stage = parsed.data.pipeline_stage_id
        ? await getStageById(client, session.agency_id, parsed.data.pipeline_stage_id)
        : await getStageById(client, session.agency_id, before.pipeline_stage_id);
      if (!stage || stage.pipeline_id !== before.pipeline_id) {
        return { error: "Pipeline stage not found." as const };
      }

      const producerUserId =
        parsed.data.producer_user_id !== undefined
          ? parsed.data.producer_user_id
          : before.producer_user_id;
      if (!producerUserId) {
        return { error: "Producer is required." as const };
      }

      const producerExists = await activeAgencyUserExists(
        client,
        producerUserId,
        session.agency_id,
        ["producer", "admin"],
      );
      if (!producerExists) {
        return { error: "Producer not found." as const };
      }

      const derivedStatus = mapDealStatusFromStageType(stage.stage_type);
      let nextStatus = derivedStatus;
      if (parsed.data.status === "archived") {
        nextStatus = "archived";
      } else if (parsed.data.status && parsed.data.status !== derivedStatus) {
        return { error: "Status must match stage type or be archived." as const };
      }

      const updateRes = await client.query(
        `
          UPDATE crm_deals
          SET
            pipeline_stage_id = $2,
            account_id = $3,
            lead_id = $4,
            producer_user_id = $5,
            name = $6,
            estimated_revenue = $7,
            estimated_premium = $8,
            estimated_commission_pct = $9,
            expected_close_date = $10,
            next_step = $11,
            next_step_due_at = $12,
            status = $13
          WHERE id = $1
            AND agency_id = $14
          RETURNING *
        `,
        [
          id,
          parsed.data.pipeline_stage_id ?? before.pipeline_stage_id,
          parsed.data.account_id !== undefined ? parsed.data.account_id : before.account_id,
          parsed.data.lead_id !== undefined ? parsed.data.lead_id : before.lead_id,
          producerUserId,
          parsed.data.name ?? before.name,
          parsed.data.estimated_revenue ?? before.estimated_revenue,
          parsed.data.estimated_premium !== undefined
            ? parsed.data.estimated_premium
            : before.estimated_premium,
          parsed.data.estimated_commission_pct !== undefined
            ? parsed.data.estimated_commission_pct
            : before.estimated_commission_pct,
          parsed.data.expected_close_date !== undefined
            ? parsed.data.expected_close_date
            : before.expected_close_date,
          parsed.data.next_step !== undefined ? parsed.data.next_step : before.next_step,
          parsed.data.next_step_due_at !== undefined
            ? parsed.data.next_step_due_at
            : before.next_step_due_at,
          nextStatus,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.deal.update",
        entityType: "crm_deal",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.deal.updated",
        entityType: "crm_deal",
        entityId: id,
        metaJson: {
          pipeline_stage_id: after.pipeline_stage_id,
          status: after.status,
          estimated_revenue: after.estimated_revenue,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const statusMap: Record<string, number> = {
        "Deal not found.": 404,
        "Pipeline stage not found.": 404,
        "Producer not found.": 400,
        "Producer is required.": 400,
        "Status must match stage type or be archived.": 400,
      };
      const message = updated.error ?? "Unable to update deal.";
      return jsonError(statusMap[message] ?? 400, message);
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/deals/[id] failed", error);
    return jsonError(500, "Unable to update deal.");
  }
}
