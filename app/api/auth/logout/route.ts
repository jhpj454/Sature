import { NextRequest, NextResponse } from "next/server";
import { withTransaction } from "@/src/db/index";
import {
  clearSessionCookie,
  parseSessionCookieValue,
  SESSION_COOKIE_NAME,
} from "@/src/server/auth";

export async function POST(request: NextRequest) {
  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const parsed = parseSessionCookieValue(rawCookie);

  if (parsed) {
    try {
      await withTransaction(async (client) => {
        await client.query("SELECT set_config('app.current_agency_id', $1, true)", [
          parsed.agencyId,
        ]);
        await client.query(
          `
            DELETE FROM sessions
            WHERE agency_id = $1
              AND session_token = $2
          `,
          [parsed.agencyId, parsed.sessionToken],
        );
      });
    } catch {
      // Best-effort invalidation. Always continue to clear cookie and return ok.
    }
  }

  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}

function methodNotAllowed() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export function GET() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
