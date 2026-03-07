import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const policyRes = await client.query(
        `
          SELECT id
          FROM policies
          WHERE id = $1
            AND agency_id = $2
          LIMIT 1
        `,
        [id, session.agency_id],
      );

      if (policyRes.rowCount === 0) {
        return { error: "Policy not found." as const };
      }

      const exposuresRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            policy_id,
            exposure_type,
            data_json,
            created_at,
            updated_at
          FROM policy_exposures
          WHERE policy_id = $1
            AND agency_id = $2
          ORDER BY created_at DESC
        `,
        [id, session.agency_id],
      );

      return { data: exposuresRes.rows };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
