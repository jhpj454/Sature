import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const CATEGORY_TO_ACTIVITY_TYPE: Record<string, string> = {
  meeting: "meeting",
  call: "call",
  personal: "note",
  renewal: "note",
  task: "task",
  other: "note",
};

const patchEventSchema = z.object({
  summary: z.string().trim().min(1).optional(),
  category: z.enum(["meeting", "call", "personal", "renewal", "task", "other"]).optional(),
  occurred_at: z.string().optional(),
  end_at: z.string().nullable().optional(),
  all_day: z.boolean().optional(),
  location: z.string().trim().nullable().optional(),
  recurrence_rule: z.string().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const parsed = patchEventSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    // TODO: Edits to single occurrences of recurring events are OUT OF SCOPE.
    // Currently any PATCH updates the parent activity, affecting all occurrences.

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      // Fetch before-state
      const beforeRes = await client.query(
        `SELECT * FROM activities WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL`,
        [id, session.agency_id],
      );
      if (beforeRes.rows.length === 0) {
        return { error: "Event not found." as const };
      }
      const before = beforeRes.rows[0];

      // Build update fields
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      const { summary, category, occurred_at, end_at, all_day, location, recurrence_rule } = parsed.data;

      if (summary !== undefined) {
        updates.push(`summary = $${paramIdx++}`);
        values.push(summary);
      }
      if (category !== undefined) {
        updates.push(`category = $${paramIdx++}`);
        values.push(category);
        updates.push(`activity_type = $${paramIdx++}`);
        values.push(CATEGORY_TO_ACTIVITY_TYPE[category] ?? "note");
      }
      if (occurred_at !== undefined) {
        updates.push(`occurred_at = $${paramIdx++}`);
        values.push(occurred_at);
      }
      if (end_at !== undefined) {
        updates.push(`end_at = $${paramIdx++}`);
        values.push(end_at ?? null);
      }
      if (all_day !== undefined) {
        updates.push(`all_day = $${paramIdx++}`);
        values.push(all_day);
      }
      if (location !== undefined) {
        updates.push(`location = $${paramIdx++}`);
        values.push(location ?? null);
      }
      if (recurrence_rule !== undefined) {
        updates.push(`recurrence_rule = $${paramIdx++}`);
        values.push(recurrence_rule ?? null);
      }

      if (updates.length === 0) {
        return { data: before };
      }

      updates.push(`updated_at = now()`);
      updates.push(`updated_by = $${paramIdx++}`);
      values.push(session.user_id);

      // id and agency_id for WHERE
      values.push(id);
      values.push(session.agency_id);

      const updateRes = await client.query(
        `UPDATE activities SET ${updates.join(", ")} WHERE id = $${paramIdx++} AND agency_id = $${paramIdx++} RETURNING *`,
        values,
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "calendar.event.update",
        entityType: "activity",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "calendar.event.updated",
        entityType: "activity",
        entityId: id,
        metaJson: { category: after.category, summary: after.summary },
      });

      return { data: after };
    });

    if ("error" in updated) {
      return jsonError(404, updated.error ?? "Event not found.");
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    console.error("PATCH /api/crm/calendar/[id] failed", error);
    return jsonError(500, "Unable to update calendar event.");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `SELECT * FROM activities WHERE id = $1 AND agency_id = $2 AND deleted_at IS NULL`,
        [id, session.agency_id],
      );
      if (beforeRes.rows.length === 0) {
        return { error: "Event not found." as const };
      }
      const before = beforeRes.rows[0];

      await client.query(
        `UPDATE activities SET deleted_at = now() WHERE id = $1 AND agency_id = $2`,
        [id, session.agency_id],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "calendar.event.delete",
        entityType: "activity",
        entityId: id,
        beforeJson: before,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "calendar.event.deleted",
        entityType: "activity",
        entityId: id,
        metaJson: { category: before.category, summary: before.summary },
      });

      return { data: true };
    });

    if ("error" in result) {
      return jsonError(404, result.error ?? "Event not found.");
    }

    return NextResponse.json({ ok: true, data: null });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    console.error("DELETE /api/crm/calendar/[id] failed", error);
    return jsonError(500, "Unable to delete calendar event.");
  }
}
