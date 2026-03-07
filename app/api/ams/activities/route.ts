import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { createActivity } from "@/src/server/entity-writes";

const ENTITY_TYPES = [
  "policy",
  "service_case",
  "document",
  "contact",
  "policy_transaction",
  "carrier",
] as const;

const MANUAL_ACTIVITY_TYPES = ["note", "email", "call"] as const;

const querySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
});

const createSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  activity_type: z.enum(MANUAL_ACTIVITY_TYPES),
  occurred_at: z.string().datetime().optional(),
  summary: z.string().min(1),
  details: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = querySchema.safeParse({
      entity_type: request.nextUrl.searchParams.get("entity_type") ?? undefined,
      entity_id: request.nextUrl.searchParams.get("entity_id") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            entity_type,
            entity_id,
            activity_type,
            occurred_at,
            summary,
            details,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM activities
          WHERE deleted_at IS NULL
            AND entity_type = $1
            AND entity_id = $2
          ORDER BY occurred_at DESC, created_at DESC
        `,
        [parsedQuery.data.entity_type, parsedQuery.data.entity_id],
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const activity = await withTenantClientFromRequest(request, async (client, session) => {
      return createActivity(
        {
          client,
          session,
          meta: {
            requestId: request.headers.get("x-request-id"),
            ipAddress: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          },
        },
        {
          entity_type: parsed.data.entity_type,
          entity_id: parsed.data.entity_id,
          activity_type: parsed.data.activity_type,
          occurred_at: parsed.data.occurred_at ?? null,
          summary: parsed.data.summary,
          details: parsed.data.details,
        },
      );
    });

    return NextResponse.json({ ok: true, data: activity }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
