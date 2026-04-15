import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export async function GET(request: NextRequest) {
  try {
    const data = await withTenantClientFromRequest(request, async (client, session) => {
      if (session.role !== "admin") {
        throw new UnauthorizedError("Forbidden");
      }

      const [usersResult, policiesResult, accountsResult] = await Promise.all([
        client.query(
          `
            SELECT
              COUNT(*) FILTER (WHERE status = 'active') AS active_count,
              COUNT(*) AS total_count
            FROM users
            WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
          `,
        ),
        client.query(
          `
            SELECT COUNT(*) AS active_count
            FROM policies
            WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
              AND status = 'active'
          `,
        ),
        client.query(
          `
            SELECT COUNT(*) AS total_count
            FROM accounts
            WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
          `,
        ),
      ]);

      return {
        users: {
          active: Number(usersResult.rows[0]?.active_count ?? 0),
          total: Number(usersResult.rows[0]?.total_count ?? 0),
        },
        policies: {
          active: Number(policiesResult.rows[0]?.active_count ?? 0),
        },
        accounts: {
          total: Number(accountsResult.rows[0]?.total_count ?? 0),
        },
      };
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
