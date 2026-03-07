import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export async function GET(request: NextRequest) {
  try {
    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            display_name,
            email,
            role,
            status
          FROM users
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND status = 'active'
          ORDER BY display_name ASC
        `,
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
