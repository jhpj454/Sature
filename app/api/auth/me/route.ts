import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

export async function GET(request: NextRequest) {
  try {
    const me = await withTenantClientFromRequest(request, async (_client, session) => {
      return {
        user_id: session.user_id,
        agency_id: session.agency_id,
        email: session.email,
        display_name: session.display_name,
        role: session.role,
        status: session.status,
      };
    });

    return NextResponse.json({ ok: true, ...me });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
