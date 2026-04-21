import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import { expandRRule } from "@/src/server/rrule";
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

const createEventSchema = z.object({
  summary: z.string().trim().min(1),
  category: z.enum(["meeting", "call", "personal", "renewal", "task", "other"]),
  occurred_at: z.string(),
  end_at: z.string().nullable().optional(),
  all_day: z.boolean().default(false),
  location: z.string().trim().nullable().optional(),
  recurrence_rule: z.string().nullable().optional(),
  entity_type: z.string().nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startParam = searchParams.get("start") ?? null;
    const endParam = searchParams.get("end") ?? null;
    const categoryParam = searchParams.get("category") ?? null;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      // Default to current month if not provided
      const now = new Date();
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const rangeStart = startParam ?? defaultStart;
      const rangeEnd = endParam ?? defaultEnd;

      // Fetch calendar activities (category IS NOT NULL)
      const activitiesRes = await client.query(
        `
        SELECT
          a.id,
          a.summary AS title,
          a.occurred_at AS start_at,
          a.end_at,
          a.all_day,
          a.location,
          a.category,
          a.recurrence_rule,
          a.entity_type,
          a.entity_id,
          a.details,
          'activity' AS source_type,
          creator.display_name AS created_by_name
        FROM activities a
        LEFT JOIN users creator ON creator.id = a.created_by AND creator.agency_id = a.agency_id
        WHERE a.agency_id = $1
          AND a.deleted_at IS NULL
          AND a.category IS NOT NULL
          AND a.occurred_at >= $2::timestamptz
          AND a.occurred_at <= $3::timestamptz
          AND ($4::text IS NULL OR a.category = $4)
        ORDER BY a.occurred_at ASC
        `,
        [session.agency_id, rangeStart, rangeEnd, categoryParam],
      );

      // Expand recurring events
      const expandedActivities: typeof activitiesRes.rows = [];
      for (const row of activitiesRes.rows) {
        if (row.recurrence_rule) {
          const dtstart = new Date(row.start_at);
          const rangeStartDate = new Date(rangeStart);
          const rangeEndDate = new Date(rangeEnd);
          const occurrences = expandRRule(row.recurrence_rule, dtstart, rangeStartDate, rangeEndDate);

          for (const occurrence of occurrences) {
            // Calculate duration to offset end_at
            let endAt: Date | null = null;
            if (row.end_at) {
              const duration = new Date(row.end_at).getTime() - dtstart.getTime();
              endAt = new Date(occurrence.getTime() + duration);
            }
            expandedActivities.push({
              ...row,
              start_at: occurrence.toISOString(),
              end_at: endAt ? endAt.toISOString() : null,
              // Mark as a recurrence instance
              id: `${row.id}__${occurrence.toISOString()}`,
              parent_id: row.id,
            });
          }
        } else {
          expandedActivities.push(row);
        }
      }

      // Fetch tasks (read-only overlay)
      const rangeStartDate = new Date(rangeStart);
      const rangeEndDate = new Date(rangeEnd);
      const startDateStr = rangeStartDate.toISOString().slice(0, 10);
      const endDateStr = rangeEndDate.toISOString().slice(0, 10);

      const tasksRes = await client.query(
        `
        SELECT
          t.id,
          t.title,
          t.due_date::timestamptz AS start_at,
          null AS end_at,
          true AS all_day,
          'task' AS category,
          'task' AS source_type,
          t.status,
          u.display_name AS assignee_display_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_to_user_id AND u.agency_id = t.agency_id
        WHERE t.agency_id = $1
          AND t.deleted_at IS NULL
          AND t.status = 'open'
          AND t.due_date IS NOT NULL
          AND t.due_date >= $2::date
          AND t.due_date <= $3::date
        ORDER BY t.due_date ASC
        `,
        [session.agency_id, startDateStr, endDateStr],
      );

      const combined = [...expandedActivities, ...tasksRes.rows].sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
      );

      return combined;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    console.error("GET /api/crm/calendar failed", error);
    return jsonError(500, "Unable to load calendar events.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Invalid payload.");
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const {
        summary,
        category,
        occurred_at,
        end_at,
        all_day,
        location,
        recurrence_rule,
        entity_type,
        entity_id,
      } = parsed.data;

      const activity_type = CATEGORY_TO_ACTIVITY_TYPE[category] ?? "note";

      // For standalone events, use entity_type='general' and generate a UUID
      const finalEntityType = entity_type ?? "general";
      let finalEntityId = entity_id ?? null;

      if (!finalEntityId) {
        const uuidRes = await client.query<{ uuid: string }>("SELECT gen_random_uuid()::text AS uuid");
        finalEntityId = uuidRes.rows[0].uuid;
      }

      const insertRes = await client.query(
        `
        INSERT INTO activities (
          agency_id,
          activity_type,
          entity_type,
          entity_id,
          summary,
          occurred_at,
          end_at,
          all_day,
          location,
          category,
          recurrence_rule,
          created_by,
          updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
        RETURNING *
        `,
        [
          session.agency_id,
          activity_type,
          finalEntityType,
          finalEntityId,
          summary,
          occurred_at,
          end_at ?? null,
          all_day,
          location ?? null,
          category,
          recurrence_rule ?? null,
          session.user_id,
        ],
      );

      const activity = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "calendar.event.create",
        entityType: "activity",
        entityId: activity.id,
        afterJson: activity,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "calendar.event.created",
        entityType: "activity",
        entityId: activity.id,
        metaJson: { category, summary, occurred_at },
      });

      return activity;
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    console.error("POST /api/crm/calendar failed", error);
    return jsonError(500, "Unable to create calendar event.");
  }
}
