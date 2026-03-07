import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const createAccountSchema = z.object({
  account_type: z.enum(["commercial", "personal"]),
  account_name: z.string().min(1),
  status: z.enum(["prospect", "client", "lost"]).default("prospect"),
  assigned_producer_id: z.string().uuid().nullable().optional(),
  assigned_csr_id: z.string().uuid().nullable().optional(),
  industry_segment: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const listAccountsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  status: z.enum(["prospect", "client", "lost"]).optional(),
  assigned_producer_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

async function activeUserExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  userId: string,
  agencyId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND agency_id = $2
        AND status = 'active'
      LIMIT 1
    `,
    [userId, agencyId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listAccountsQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      assigned_producer_id:
        request.nextUrl.searchParams.get("assigned_producer_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const { q, status, assigned_producer_id, page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const rowsRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            account_type,
            account_name,
            status,
            assigned_producer_id,
            assigned_csr_id,
            industry_segment,
            notes,
            created_at,
            updated_at
          FROM accounts
          WHERE agency_id = $1
            AND ($2::text IS NULL OR status::text = $2)
            AND ($3::uuid IS NULL OR assigned_producer_id = $3)
            AND (
              $4::text IS NULL
              OR account_name ILIKE '%' || $4 || '%'
              OR industry_segment ILIKE '%' || $4 || '%'
            )
          ORDER BY created_at DESC
          LIMIT $5 OFFSET $6
        `,
        [
          session.agency_id,
          status ?? null,
          assigned_producer_id ?? null,
          q ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM accounts
          WHERE agency_id = $1
            AND ($2::text IS NULL OR status::text = $2)
            AND ($3::uuid IS NULL OR assigned_producer_id = $3)
            AND (
              $4::text IS NULL
              OR account_name ILIKE '%' || $4 || '%'
              OR industry_segment ILIKE '%' || $4 || '%'
            )
        `,
        [session.agency_id, status ?? null, assigned_producer_id ?? null, q ?? null],
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
    const parsed = createAccountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const account = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        if (parsed.data.assigned_producer_id) {
          const producerExists = await activeUserExists(
            client,
            parsed.data.assigned_producer_id,
            session.agency_id,
          );
          if (!producerExists) {
            return { error: "Assigned producer not found." as const };
          }
        }

        if (parsed.data.assigned_csr_id) {
          const csrExists = await activeUserExists(
            client,
            parsed.data.assigned_csr_id,
            session.agency_id,
          );
          if (!csrExists) {
            return { error: "Assigned CSR not found." as const };
          }
        }

        const result = await client.query<{
          id: string;
          agency_id: string;
          account_type: string;
          account_name: string;
          status: string;
          assigned_producer_id: string | null;
          assigned_csr_id: string | null;
          industry_segment: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `
            INSERT INTO accounts (
              agency_id,
              account_type,
              account_name,
              status,
              assigned_producer_id,
              assigned_csr_id,
              industry_segment,
              notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          [
            session.agency_id,
            parsed.data.account_type,
            parsed.data.account_name,
            parsed.data.status,
            parsed.data.assigned_producer_id ?? null,
            parsed.data.assigned_csr_id ?? null,
            parsed.data.industry_segment ?? null,
            parsed.data.notes ?? null,
          ],
        );

        const created = result.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "account.create",
          entityType: "account",
          entityId: created.id,
          afterJson: created,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "account.created",
          entityType: "account",
          entityId: created.id,
          metaJson: {
            account_name: created.account_name,
            status: created.status,
          },
        });

        return created;
      },
    );

    if ("error" in account) {
      return NextResponse.json({ error: account.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: account }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
