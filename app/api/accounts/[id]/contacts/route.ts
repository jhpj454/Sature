import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { writeAuditLog } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const createContactSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().min(1).nullable().optional(),
  preferred_contact_method: z.enum(["email", "phone", "text"]).nullable().optional(),
  timezone: z.string().trim().min(1).nullable().optional(),
  do_not_contact: z.boolean().default(false),
  source: z.enum(["referral", "import", "website", "manual", "other"]).nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

async function accountExistsForAgency(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  accountId: string,
  agencyId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM accounts
      WHERE id = $1
        AND agency_id = $2
      LIMIT 1
    `,
    [accountId, agencyId],
  );

  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: accountId } = await context.params;
    if (!z.uuid().safeParse(accountId).success) {
      return jsonError(400, "Invalid account id.");
    }

    const parsedQuery = listQuerySchema.safeParse({
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const { page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const accountExists = await accountExistsForAgency(client, accountId, session.agency_id);
      if (!accountExists) {
        return { missingAccount: true as const };
      }

      const rowsRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            account_id,
            first_name,
            last_name,
            email,
            phone,
            preferred_contact_method,
            timezone,
            do_not_contact,
            source,
            created_at,
            updated_at,
            deleted_at
          FROM contacts
          WHERE account_id = $1
            AND agency_id = $2
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT $3 OFFSET $4
        `,
        [accountId, session.agency_id, page_size, offset],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM contacts
          WHERE account_id = $1
            AND agency_id = $2
            AND deleted_at IS NULL
        `,
        [accountId, session.agency_id],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    if ("missingAccount" in data) {
      return jsonError(404, "Account not found.");
    }

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
      return jsonError(401, "Unauthorized");
    }

    console.error("GET /api/accounts/[id]/contacts failed", error);
    return jsonError(500, "Unable to load contacts.");
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: accountId } = await context.params;
    if (!z.uuid().safeParse(accountId).success) {
      return jsonError(400, "Invalid account id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Invalid payload.";
      return jsonError(400, firstIssue);
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const accountExists = await accountExistsForAgency(client, accountId, session.agency_id);
      if (!accountExists) {
        return { error: "Account not found." as const };
      }

      const insertRes = await client.query(
        `
          INSERT INTO contacts (
            agency_id,
            account_id,
            first_name,
            last_name,
            email,
            phone,
            preferred_contact_method,
            timezone,
            do_not_contact,
            source,
            contact_type,
            status,
            address,
            tags,
            metadata,
            created_by,
            updated_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, 'person',
            'active', '{}'::jsonb, '{}'::text[], '{}'::jsonb, $11, $11
          )
          RETURNING
            id,
            agency_id,
            account_id,
            first_name,
            last_name,
            email,
            phone,
            preferred_contact_method,
            timezone,
            do_not_contact,
            source,
            created_at,
            updated_at,
            deleted_at
        `,
        [
          session.agency_id,
          accountId,
          parsed.data.first_name,
          parsed.data.last_name,
          parsed.data.email ?? null,
          parsed.data.phone ?? null,
          parsed.data.preferred_contact_method ?? null,
          parsed.data.timezone ?? null,
          parsed.data.do_not_contact,
          parsed.data.source ?? null,
          session.user_id,
        ],
      );

      const row = insertRes.rows[0];

      await writeAuditLog(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "contact.create",
        entityType: "contact",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "contact.created",
        entityType: "contact",
        entityId: row.id,
        metaJson: {
          account_id: row.account_id,
          email: row.email,
          source: row.source,
        },
      });

      return { data: row };
    });

    if ("error" in created) {
      return jsonError(404, created.error ?? "Account not found.");
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return jsonError(401, "Unauthorized");
    }

    console.error("POST /api/accounts/[id]/contacts failed", error);
    return jsonError(500, "Unable to create contact.");
  }
}
