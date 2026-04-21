import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const listCustomersQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  account_type: z.enum(["commercial", "personal"]).optional(),
  has_active_policies: z
    .string()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined))
    .optional(),
  assigned_producer_id: z.string().uuid().optional(),
  view: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listCustomersQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      account_type: request.nextUrl.searchParams.get("account_type") ?? undefined,
      has_active_policies:
        request.nextUrl.searchParams.get("has_active_policies") ?? undefined,
      assigned_producer_id:
        request.nextUrl.searchParams.get("assigned_producer_id") ?? undefined,
      view: request.nextUrl.searchParams.get("view") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const { q, account_type, has_active_policies, assigned_producer_id, view, page, page_size } =
      parsedQuery.data;
    const offset = (page - 1) * page_size;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      // Renewals view: return accounts with policies expiring within 60 days
      if (view === "renewals") {
        const renewalsRes = await client.query(
          `
          SELECT
            a.id AS account_id,
            a.account_name,
            p.id AS policy_id,
            p.policy_number,
            p.lob,
            p.expiration_date
          FROM policies p
          JOIN accounts a ON a.id = p.account_id AND a.agency_id = p.agency_id
          WHERE p.agency_id = $1
            AND p.status = 'active'
            AND p.expiration_date >= CURRENT_DATE
            AND p.expiration_date <= CURRENT_DATE + INTERVAL '60 days'
          ORDER BY p.expiration_date ASC
          LIMIT 50
          `,
          [session.agency_id],
        );

        return { renewals: renewalsRes.rows };
      }

      // Main customers list
      const rowsRes = await client.query(
        `
        SELECT
          a.id,
          a.account_name,
          a.account_type,
          a.status,
          a.assigned_producer_id,
          a.created_at,
          producer.display_name AS producer_display_name,
          c.first_name AS primary_contact_first_name,
          c.last_name AS primary_contact_last_name,
          c.email AS primary_contact_email,
          (SELECT COUNT(*) FROM policies p WHERE p.account_id = a.id AND p.agency_id = a.agency_id AND p.status = 'active') AS active_policy_count,
          (SELECT MIN(p.expiration_date) FROM policies p WHERE p.account_id = a.id AND p.agency_id = a.agency_id AND p.status = 'active' AND p.expiration_date >= CURRENT_DATE) AS next_renewal_date
        FROM accounts a
        LEFT JOIN users producer ON producer.id = a.assigned_producer_id AND producer.agency_id = a.agency_id
        LEFT JOIN LATERAL (
          SELECT first_name, last_name, email FROM contacts
          WHERE account_id = a.id AND agency_id = a.agency_id AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT 1
        ) c ON true
        WHERE a.agency_id = $1
          AND ($2::text IS NULL OR a.account_type::text = $2)
          AND ($3::text IS NULL OR a.account_name ILIKE '%' || $3 || '%' OR COALESCE(c.first_name, '') ILIKE '%' || $3 || '%' OR COALESCE(c.last_name, '') ILIKE '%' || $3 || '%')
          AND ($4::boolean IS NULL OR ($4 = true AND (SELECT COUNT(*) FROM policies p2 WHERE p2.account_id = a.id AND p2.agency_id = a.agency_id AND p2.status = 'active') > 0))
          AND ($5::uuid IS NULL OR a.assigned_producer_id = $5)
        ORDER BY a.account_name ASC
        LIMIT $6 OFFSET $7
        `,
        [
          session.agency_id,
          account_type ?? null,
          q ?? null,
          has_active_policies ?? null,
          assigned_producer_id ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
        SELECT COUNT(*)::text AS total
        FROM accounts a
        LEFT JOIN LATERAL (
          SELECT first_name, last_name FROM contacts
          WHERE account_id = a.id AND agency_id = a.agency_id AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT 1
        ) c ON true
        WHERE a.agency_id = $1
          AND ($2::text IS NULL OR a.account_type::text = $2)
          AND ($3::text IS NULL OR a.account_name ILIKE '%' || $3 || '%' OR COALESCE(c.first_name, '') ILIKE '%' || $3 || '%' OR COALESCE(c.last_name, '') ILIKE '%' || $3 || '%')
          AND ($4::boolean IS NULL OR ($4 = true AND (SELECT COUNT(*) FROM policies p2 WHERE p2.account_id = a.id AND p2.agency_id = a.agency_id AND p2.status = 'active') > 0))
          AND ($5::uuid IS NULL OR a.assigned_producer_id = $5)
        `,
        [
          session.agency_id,
          account_type ?? null,
          q ?? null,
          has_active_policies ?? null,
          assigned_producer_id ?? null,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    if ("renewals" in result) {
      return NextResponse.json({ ok: true, data: result.renewals });
    }

    return NextResponse.json({
      ok: true,
      data: result.rows,
      pagination: {
        page,
        page_size,
        total: result.total,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/customers failed", error);
    return jsonError(500, "Unable to load customers.");
  }
}
