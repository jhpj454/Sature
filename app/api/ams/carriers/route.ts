import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const INTEGRATION_STATUSES = ["none", "pending", "connected", "error"] as const;

const createCarrierSchema = z.object({
  name: z.string().min(1),
  naic_code: z.string().min(1).nullable().optional(),
  producer_code: z.string().min(1).nullable().optional(),
  integration_status: z.enum(INTEGRATION_STATUSES).default("none"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const listQuerySchema = z.object({
  name: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      name: request.nextUrl.searchParams.get("name") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const { name, page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            name,
            naic_code,
            producer_code,
            integration_status,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM carriers
          WHERE deleted_at IS NULL
            AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [name ?? null, page_size, offset],
      );

      const countResult = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM carriers
          WHERE deleted_at IS NULL
            AND ($1::text IS NULL OR name ILIKE '%' || $1 || '%')
        `,
        [name ?? null],
      );

      return {
        rows: result.rows,
        total: Number(countResult.rows[0]?.total ?? "0"),
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
    const parsed = createCarrierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const carrier = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const result = await client.query(
          `
            INSERT INTO carriers (
              agency_id,
              name,
              naic_code,
              producer_code,
              integration_status,
              metadata,
              created_by,
              updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          [
            session.agency_id,
            parsed.data.name,
            parsed.data.naic_code ?? null,
            parsed.data.producer_code ?? null,
            parsed.data.integration_status,
            JSON.stringify(parsed.data.metadata),
            session.user_id,
            session.user_id,
          ],
        );

        const created = result.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "carrier.create",
          entityType: "carriers",
          entityId: created.id,
          afterJson: created,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "carrier.created",
          entityType: "carrier",
          entityId: created.id,
          metaJson: {
            name: created.name,
            integration_status: created.integration_status,
          },
        });

        return created;
      },
    );

    return NextResponse.json({ ok: true, data: carrier }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
