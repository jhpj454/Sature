import bcrypt from "bcrypt";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/src/db/index";
import {
  buildSessionCookieValue,
  generateSessionToken,
  getSessionExpiryDate,
  setSessionCookie,
} from "@/src/server/auth";
import {
  clearAttempts,
  getRateLimitKey,
  isRateLimited,
  recordFailedAttempt,
} from "@/src/server/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const rateKey = getRateLimitKey(ip, email.toLowerCase());

  if (isRateLimited(rateKey)) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429 },
    );
  }

  const authResult = await withTransaction(async (client) => {
    const agenciesRes = await client.query<{ id: string }>(
      `
        SELECT id
        FROM agencies
        WHERE status IN ('active', 'trial')
        ORDER BY created_at ASC
      `,
    );

    const matches: Array<{
      id: string;
      agency_id: string;
      email: string;
      password_hash: string;
      display_name: string;
      role: string;
      status: string;
    }> = [];

    for (const agency of agenciesRes.rows) {
      await client.query("SELECT set_config('app.current_agency_id', $1, true)", [agency.id]);
      const userRes = await client.query<{
        id: string;
        agency_id: string;
        email: string;
        password_hash: string;
        display_name: string;
        role: string;
        status: string;
      }>(
        `
          SELECT id, agency_id, email, password_hash, display_name, role, status
          FROM users
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND email = $1
            AND status = 'active'
          LIMIT 1
        `,
        [email.toLowerCase()],
      );

      for (const row of userRes.rows) {
        matches.push(row);
      }

      if (matches.length > 1) {
        return { error: "AMBIGUOUS_EMAIL" as const };
      }
    }

    const user = matches[0];
    if (!user || user.status !== "active") {
      return null;
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return null;
    }

    await client.query("SELECT set_config('app.current_agency_id', $1, true)", [
      user.agency_id,
    ]);

    const sessionToken = generateSessionToken();
    const expiresAt = getSessionExpiryDate();

    await client.query(
      `
        INSERT INTO sessions (agency_id, user_id, session_token, expires_at)
        VALUES ($1, $2, $3, $4)
      `,
      [user.agency_id, user.id, sessionToken, expiresAt],
    );

    await client.query(
      `
        UPDATE users
        SET last_login_at = now()
        WHERE id = $1
      `,
      [user.id],
    );

    return {
      user: {
        id: user.id,
        agency_id: user.agency_id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
      },
      sessionToken,
      expiresAt,
    };
  });

  if (!authResult) {
    recordFailedAttempt(rateKey);
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  if ("error" in authResult) {
    recordFailedAttempt(rateKey);
    return NextResponse.json(
      { error: "Multiple active users found for this email. Contact support." },
      { status: 409 },
    );
  }

  clearAttempts(rateKey);
  await setSessionCookie(
    buildSessionCookieValue(authResult.user.agency_id, authResult.sessionToken),
    authResult.expiresAt,
  );

  return NextResponse.json({
    ok: true,
    user: authResult.user,
    expires_at: authResult.expiresAt.toISOString(),
  });
}
