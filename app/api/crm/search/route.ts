import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
      return NextResponse.json({ ok: true, data: { leads: [], customers: [], pipelines: [] } });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const { agency_id } = session;
      const pattern = `%${q}%`;

      // Run three queries in parallel using Promise.all
      const [leadsRes, customersRes, pipelinesRes] = await Promise.all([
        client.query(
          `SELECT id, first_name, last_name, company_name, email, status
           FROM crm_leads
           WHERE agency_id = $1
             AND (company_name ILIKE $2 OR first_name ILIKE $2 OR last_name ILIKE $2 OR email ILIKE $2)
           ORDER BY updated_at DESC
           LIMIT 5`,
          [agency_id, pattern],
        ),
        client.query(
          `SELECT id, account_name
           FROM accounts
           WHERE agency_id = $1
             AND account_name ILIKE $2
           ORDER BY updated_at DESC
           LIMIT 5`,
          [agency_id, pattern],
        ),
        client.query(
          `SELECT id, name
           FROM crm_pipelines
           WHERE agency_id = $1
             AND is_active = true
             AND name ILIKE $2
           ORDER BY created_at DESC
           LIMIT 5`,
          [agency_id, pattern],
        ),
      ]);

      return {
        leads: leadsRes.rows,
        customers: customersRes.rows,
        pipelines: pipelinesRes.rows,
      };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/search failed", error);
    return jsonError(500, "Search failed.");
  }
}
