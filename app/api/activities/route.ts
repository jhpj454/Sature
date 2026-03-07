import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { writeAuditLog } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const ENTITY_TYPES = [
  "policy",
  "service_case",
  "document",
  "contact",
  "policy_transaction",
  "carrier",
] as const;

const createActivitySchema = z.object({
  activity_type: z.enum(["note", "call", "email", "meeting", "system"]),
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  content: z.string().trim().min(1),
});

const listQuerySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES).optional(),
  entity_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      entity_type: request.nextUrl.searchParams.get("entity_type") ?? undefined,
      entity_id: request.nextUrl.searchParams.get("entity_id") ?? undefined,
      contact_id: request.nextUrl.searchParams.get("contact_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const { entity_type, entity_id, contact_id, page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client) => {
      const rowsRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            activity_type,
            entity_type,
            entity_id,
            summary AS content,
            occurred_at,
            created_by AS created_by_user_id,
            created_at,
            updated_at
          FROM activities
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND deleted_at IS NULL
            AND ($1::text IS NULL OR entity_type = $1)
            AND ($2::uuid IS NULL OR entity_id = $2)
            AND (
              $3::uuid IS NULL
              OR (entity_type = 'contact' AND entity_id = $3)
            )
          ORDER BY occurred_at DESC, created_at DESC
          LIMIT $4 OFFSET $5
        `,
        [
          entity_type ?? null,
          entity_id ?? null,
          contact_id ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM activities
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND deleted_at IS NULL
            AND ($1::text IS NULL OR entity_type = $1)
            AND ($2::uuid IS NULL OR entity_id = $2)
            AND (
              $3::uuid IS NULL
              OR (entity_type = 'contact' AND entity_id = $3)
            )
        `,
        [entity_type ?? null, entity_id ?? null, contact_id ?? null],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: data.rows,
      pagination: {
        page,
        page_size,
        total: data.total,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createActivitySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const insertRes = await client.query(
        `
          INSERT INTO activities (
            agency_id,
            activity_type,
            entity_type,
            entity_id,
            summary,
            details,
            created_by,
            updated_by
          ) VALUES (
            current_setting('app.current_agency_id', true)::uuid,
            $1, $2, $3, $4, '{}'::jsonb, $5, $5
          )
          RETURNING
            id,
            agency_id,
            activity_type,
            entity_type,
            entity_id,
            summary AS content,
            occurred_at,
            created_by AS created_by_user_id,
            created_at,
            updated_at
        `,
        [
          parsed.data.activity_type,
          parsed.data.entity_type,
          parsed.data.entity_id,
          parsed.data.content,
          session.user_id,
        ],
      );

      const row = insertRes.rows[0];

      await writeAuditLog(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "activity.create",
        entityType: "activity",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "activity.created",
        entityType: "activity",
        entityId: row.id,
        metaJson: {
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          activity_type: row.activity_type,
        },
      });

      return row;
    });

    return NextResponse.json({ ok: true, data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
