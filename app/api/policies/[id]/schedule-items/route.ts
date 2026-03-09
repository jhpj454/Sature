import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const SCHEDULE_TYPES = ["vehicle", "location", "equipment", "employee"] as const;

const createSchema = z.object({
  schedule_type: z.enum(SCHEDULE_TYPES),
  description: z.string().min(1),
  value: z.coerce.number().nullable().optional(),
  identifier: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function policyExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  policyId: string,
) {
  const result = await client.query(
    `SELECT 1 FROM policies WHERE id = $1 LIMIT 1`,
    [policyId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id, agency_id, policy_id, schedule_type, description,
            value, identifier, created_at, updated_at
          FROM policy_schedule_items
          WHERE policy_id = $1
          ORDER BY schedule_type ASC, created_at DESC
        `,
        [id],
      );
      return result.rows;
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const exists = await policyExists(client, id);
      if (!exists) {
        return { error: "Policy not found." as const };
      }

      const insertRes = await client.query(
        `
          INSERT INTO policy_schedule_items (
            agency_id, policy_id, schedule_type, description, value, identifier
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [
          session.agency_id,
          id,
          parsed.data.schedule_type,
          parsed.data.description,
          parsed.data.value ?? null,
          parsed.data.identifier ?? null,
        ],
      );

      const row = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_schedule_item.create",
        entityType: "policy_schedule_items",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_schedule_item.created",
        entityType: "policy_schedule_item",
        entityId: row.id,
        metaJson: { policy_id: id, schedule_type: row.schedule_type },
      });

      return { data: row };
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
