import { NextRequest, NextResponse } from "next/server";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return jsonError(400, "Invalid account ID.");
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      // Fetch account + producer
      const accountRes = await client.query(
        `
        SELECT
          a.id,
          a.account_name,
          a.account_type,
          a.status,
          a.assigned_producer_id,
          a.assigned_csr_id,
          a.industry_segment,
          a.notes,
          a.created_at,
          a.updated_at,
          producer.display_name AS producer_display_name,
          csr.display_name AS csr_display_name
        FROM accounts a
        LEFT JOIN users producer ON producer.id = a.assigned_producer_id AND producer.agency_id = a.agency_id
        LEFT JOIN users csr ON csr.id = a.assigned_csr_id AND csr.agency_id = a.agency_id
        WHERE a.id = $1 AND a.agency_id = $2
        `,
        [id, session.agency_id],
      );

      if (accountRes.rows.length === 0) {
        return null;
      }

      const account = accountRes.rows[0];

      // Fetch contacts
      const contactsRes = await client.query(
        `
        SELECT id, first_name, last_name, email, phone, contact_type, status, created_at
        FROM contacts
        WHERE account_id = $1 AND agency_id = $2 AND deleted_at IS NULL
        ORDER BY created_at ASC
        `,
        [id, session.agency_id],
      );

      // Fetch policies
      const policiesRes = await client.query(
        `
        SELECT id, policy_number, lob, expiration_date, premium_amount, status, created_at
        FROM policies
        WHERE account_id = $1 AND agency_id = $2
        ORDER BY expiration_date ASC NULLS LAST
        `,
        [id, session.agency_id],
      );

      // Fetch tasks linked to this account
      const tasksRes = await client.query(
        `
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.due_date,
          t.assigned_to_user_id,
          t.created_at,
          u.display_name AS assigned_to_display_name
        FROM tasks t
        LEFT JOIN users u ON u.id = t.assigned_to_user_id AND u.agency_id = t.agency_id
        WHERE t.agency_id = $1
          AND t.linked_entity_type = 'account'
          AND t.linked_entity_id = $2
          AND t.deleted_at IS NULL
        ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
        `,
        [session.agency_id, id],
      );

      return {
        account,
        contacts: contactsRes.rows,
        policies: policiesRes.rows,
        tasks: tasksRes.rows,
      };
    });

    if (result === null) {
      return jsonError(404, "Account not found.");
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/customers/[id] failed", error);
    return jsonError(500, "Unable to load customer.");
  }
}
