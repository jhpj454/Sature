import { NextRequest, NextResponse } from "next/server";
import { assertCrmUser, ForbiddenError } from "@/src/server/crm";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";
import { evaluateRulesForAgency } from "@/src/server/task-rules-engine";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      // Only admin or producer may manually trigger rule evaluation
      if (session.role !== "admin" && session.role !== "producer") {
        throw new ForbiddenError("Only admin or producer users can run rules.");
      }

      const engineResult = await evaluateRulesForAgency(client, session.agency_id);
      return engineResult;
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/task-rules/run failed", error);
    return jsonError(500, "Unable to run task automation rules.");
  }
}
