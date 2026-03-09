import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const SCHEDULE_TYPES = ["vehicle", "location", "equipment", "employee"] as const;

const updateSchema = z.object({
  schedule_type: z.enum(SCHEDULE_TYPES),
  description: z.string().min(1),
  value: z.coerce.number().nullable().optional(),
  identifier: z.string().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id, itemId } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(itemId).success) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT * FROM policy_schedule_items
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
          LIMIT 1 FOR UPDATE
        `,
        [itemId, id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Record not found." as const };
      }

      const updateRes = await client.query(
        `
          UPDATE policy_schedule_items
          SET
            schedule_type = $4,
            description = $5,
            value = $6,
            identifier = $7
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
          RETURNING *
        `,
        [
          itemId,
          id,
          session.agency_id,
          parsed.data.schedule_type,
          parsed.data.description,
          parsed.data.value ?? null,
          parsed.data.identifier ?? null,
        ],
      );

      const row = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_schedule_item.update",
        entityType: "policy_schedule_items",
        entityId: itemId,
        beforeJson: before,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_schedule_item.updated",
        entityType: "policy_schedule_item",
        entityId: itemId,
        metaJson: { policy_id: id },
      });

      return { data: row };
    });

    if ("error" in updated) {
      return NextResponse.json({ error: updated.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id, itemId } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(itemId).success) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT * FROM policy_schedule_items
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
          LIMIT 1
        `,
        [itemId, id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Record not found." as const };
      }

      await client.query(
        `DELETE FROM policy_schedule_items WHERE id = $1 AND policy_id = $2 AND agency_id = $3`,
        [itemId, id, session.agency_id],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_schedule_item.delete",
        entityType: "policy_schedule_items",
        entityId: itemId,
        beforeJson: before,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_schedule_item.deleted",
        entityType: "policy_schedule_item",
        entityId: itemId,
        metaJson: { policy_id: id },
      });

      return { ok: true };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
