import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  assertCrmUser,
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

const updateStageSchema = z.object({
  pipeline_stage_id: z.string().uuid(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid deal id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateStageSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload. Requires { pipeline_stage_id: uuid }");
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const before = await getVisibleDeal(client, session.agency_id, id, session, {
        forUpdate: true,
      });
      if (!before) return { error: "Deal not found." as const };

      const stage = await getStageById(client, session.agency_id, parsed.data.pipeline_stage_id);
      if (!stage || stage.pipeline_id !== before.pipeline_id) {
        return { error: "Stage not found or does not belong to this deal's pipeline." as const };
      }

      const newStatus = mapDealStatusFromStageType(stage.stage_type);

      const updateRes = await client.query(
        `
          UPDATE crm_deals
          SET pipeline_stage_id = $2, status = $3
          WHERE id = $1 AND agency_id = $4
          RETURNING *
        `,
        [id, stage.id, newStatus, session.agency_id],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.deal.stage.update",
        entityType: "crm_deal",
        entityId: id,
        beforeJson: { pipeline_stage_id: before.pipeline_stage_id, status: before.status },
        afterJson: { pipeline_stage_id: after.pipeline_stage_id, status: after.status },
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.deal.stage.updated",
        entityType: "crm_deal",
        entityId: id,
        metaJson: {
          pipeline_stage_id: after.pipeline_stage_id,
          status: after.status,
          stage_name: stage.name,
        },
      });

      return { data: after };
    });

    if ("error" in result) {
      const msg = result.error ?? "Unable to update stage.";
      return jsonError(msg === "Deal not found." ? 404 : 400, msg);
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PUT /api/crm/deals/[id]/stage failed", error);
    return jsonError(500, "Unable to update stage.");
  }
}
