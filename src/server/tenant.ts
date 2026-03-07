import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "@/src/db/index";
import { parseSessionCookieValue, SESSION_COOKIE_NAME } from "@/src/server/auth";

export type SessionContext = {
  agency_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
};

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function setTenantContextForClient(
  client: PoolClient,
  request: NextRequest,
): Promise<SessionContext> {
  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const parsed = parseSessionCookieValue(rawCookie);

  if (!parsed) {
    throw new UnauthorizedError();
  }

  if (!z.uuid().safeParse(parsed.agencyId).success) {
    throw new UnauthorizedError();
  }

  await client.query(
    "SELECT set_config('app.current_agency_id', $1, true)",
    [parsed.agencyId],
  );

  const { rows } = await client.query<SessionContext>(
    `
      SELECT
        s.agency_id,
        s.user_id,
        u.email,
        u.display_name,
        u.role,
        u.status
      FROM sessions s
      JOIN users u
        ON u.id = s.user_id
       AND u.agency_id = s.agency_id
      WHERE s.session_token = $1
        AND s.expires_at > now()
      LIMIT 1
    `,
    [parsed.sessionToken],
  );

  const session = rows[0];

  if (!session || session.agency_id !== parsed.agencyId) {
    throw new UnauthorizedError();
  }

  return session;
}

export async function withTenantClientFromRequest<T>(
  request: NextRequest,
  fn: (client: PoolClient, session: SessionContext) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    const session = await setTenantContextForClient(client, request);
    return fn(client, session);
  });
}
