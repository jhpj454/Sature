import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError, getLeadById } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ACTIVITY_TYPES = ["note", "email", "call", "meeting", "task"] as const;

const createActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  summary: z.string().trim().min(1),
  occurred_at: z.string().datetime({ offset: true }).optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid lead id.");
    }

    const activities = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const lead = await getLeadById(client, session.agency_id, id);
      if (!lead) return null;

      const result = await client.query(
        `
          SELECT
            a.id,
            a.activity_type,
            a.summary,
            a.occurred_at,
            a.created_at,
            a.created_by,
            u.display_name AS created_by_name
          FROM activities a
          LEFT JOIN users u ON u.id = a.created_by AND u.agency_id = a.agency_id
          WHERE a.agency_id = $1
            AND a.entity_type = 'lead'
            AND a.entity_id = $2
            AND a.deleted_at IS NULL
          ORDER BY a.occurred_at DESC, a.created_at DESC
        `,
        [session.agency_id, id],
      );

      return result.rows;
    });

    if (activities === null) {
      return jsonError(404, "Lead not found.");
    }

    return NextResponse.json({ ok: true, data: activities });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/leads/[id]/activities failed", error);
    return jsonError(500, "Unable to load activities.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid lead id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = createActivitySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const lead = await getLeadById(client, session.agency_id, id);
      if (!lead) return { error: "Lead not found." as const };

      const insertRes = await client.query(
        `
          INSERT INTO activities (
            agency_id,
            activity_type,
            entity_type,
            entity_id,
            summary,
            occurred_at,
            created_by,
            details
          ) VALUES ($1, $2, 'lead', $3, $4, $5, $6, '{}')
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.activity_type,
          id,
          parsed.data.summary,
          parsed.data.occurred_at ?? new Date().toISOString(),
          session.user_id,
        ],
      );

      const activity = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.lead.activity.create",
        entityType: "crm_lead",
        entityId: id,
        afterJson: activity,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.lead.activity.created",
        entityType: "crm_lead",
        entityId: id,
        metaJson: { activity_type: activity.activity_type },
      });

      return { data: activity };
    });

    if ("error" in result) {
      return jsonError(404, result.error ?? "Not found.");
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/leads/[id]/activities failed", error);
    return jsonError(500, "Unable to log activity.");
  }
}
