import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const querySchema = z.object({
  pipeline_id: z.string().uuid(),
  page_size: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(request: NextRequest) {
  try {
    const rawQuery = {
      pipeline_id: request.nextUrl.searchParams.get("pipeline_id") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    };

    const parsed = querySchema.safeParse(rawQuery);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid query.";
      return jsonError(400, issue);
    }

    const { pipeline_id, page_size } = parsed.data;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const rowsRes = await client.query(
        `
          SELECT
            l.*,
            u.display_name AS assigned_producer_display_name
          FROM crm_leads l
          LEFT JOIN users u
            ON u.id = l.assigned_producer_id
           AND u.agency_id = l.agency_id
          WHERE l.agency_id = $1
            AND l.pipeline_id = $2
          ORDER BY l.updated_at DESC, l.created_at DESC
          LIMIT $3
        `,
        [session.agency_id, pipeline_id, page_size],
      );

      return rowsRes.rows;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/leads/pipeline failed", error);
    return jsonError(500, "Unable to load pipeline leads.");
  }
}
