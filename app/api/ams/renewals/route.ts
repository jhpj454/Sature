import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

const RENEWAL_STATUSES = [
  "not_started",
  "in_progress",
  "quoted",
  "bound",
  "lost",
] as const;

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(RENEWAL_STATUSES).optional(),
  assigned_to: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = querySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      assigned_to: request.nextUrl.searchParams.get("assigned_to") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const { from, to, status, assigned_to } = parsedQuery.data;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const result = await client.query(
        `
          SELECT
            p.id,
            p.agency_id,
            p.account_id,
            p.carrier_id,
            p.lob,
            p.policy_number,
            p.effective_date,
            p.expiration_date,
            p.status,
            p.renewal_status,
            p.renewal_assigned_to,
            p.renewal_last_touch_at,
            p.renewal_next_action_at,
            p.premium_amount,
            p.commission_estimate_amount,
            p.agency_fee_amount,
            p.agency_revenue_estimate_amount,
            p.created_at,
            p.updated_at,
            c.name AS carrier_name,
            c.naic_code AS carrier_naic_code,
            COALESCE(contact_roles_data.key_contacts, '[]'::json) AS key_contacts
          FROM policies p
          LEFT JOIN carriers c
            ON c.id = p.carrier_id
           AND c.deleted_at IS NULL
          LEFT JOIN LATERAL (
            SELECT json_agg(
              json_build_object(
                'contact_role_id', cr.id,
                'role', cr.role,
                'is_primary', cr.is_primary,
                'contact', json_build_object(
                  'id', ct.id,
                  'contact_type', ct.contact_type,
                  'first_name', ct.first_name,
                  'last_name', ct.last_name,
                  'business_name', ct.business_name,
                  'email', ct.email,
                  'phone', ct.phone
                )
              )
              ORDER BY cr.is_primary DESC, cr.created_at DESC
            ) AS key_contacts
            FROM contact_roles cr
            JOIN contacts ct
              ON ct.id = cr.contact_id
             AND ct.deleted_at IS NULL
            WHERE cr.entity_type = 'policy'
              AND cr.entity_id = p.id
              AND cr.deleted_at IS NULL
          ) AS contact_roles_data ON TRUE
          WHERE p.agency_id = $5
            AND ($1::date IS NULL OR p.expiration_date >= $1)
            AND ($2::date IS NULL OR p.expiration_date <= $2)
            AND ($3::text IS NULL OR p.renewal_status = $3)
            AND ($4::uuid IS NULL OR p.renewal_assigned_to = $4)
          ORDER BY p.expiration_date ASC, p.created_at DESC
        `,
        [from ?? null, to ?? null, status ?? null, assigned_to ?? null, session.agency_id],
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
