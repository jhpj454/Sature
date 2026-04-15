import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { withTransaction } from "@/src/db/index";

export async function POST() {
  const isDev =
    process.env.NODE_ENV === "development" ||
    process.env.APP_ENV === "development";

  if (!isDev) {
    return NextResponse.json(
      { error: "Seed endpoint is only available in development." },
      { status: 403 },
    );
  }

  const passwordHash = await bcrypt.hash("admin123!", 10);

  const result = await withTransaction(async (client) => {
    const existingAgencyRes = await client.query<{ id: string }>(
      `
        SELECT id
        FROM agencies
        WHERE name = 'Saturate Demo Agency'
        LIMIT 1
      `,
    );

    let agencyId = existingAgencyRes.rows[0]?.id;
    if (!agencyId) {
      const insertedAgencyRes = await client.query<{ id: string }>(
        `
          INSERT INTO agencies (name, timezone, plan, status)
          VALUES ('Saturate Demo Agency', 'America/Chicago', 'saturate', 'active')
          RETURNING id
        `,
      );
      agencyId = insertedAgencyRes.rows[0]?.id;
    }

    if (!agencyId) {
      throw new Error("Failed to resolve seeded agency id.");
    }

    await client.query(
      "SELECT set_config('app.current_agency_id', $1, true)",
      [agencyId],
    );

    const userRes = await client.query<{
      id: string;
      email: string;
      role: string;
      agency_id: string;
    }>(
      `
        INSERT INTO users (
          agency_id,
          email,
          password_hash,
          display_name,
          role,
          status
        )
        VALUES ($1, 'admin@saturate.local', $2, 'Seed Admin', 'admin', 'active')
        ON CONFLICT (agency_id, email)
        DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          status = EXCLUDED.status,
          updated_at = now()
        RETURNING id, email, role, agency_id
      `,
      [agencyId, passwordHash],
    );

    if (!userRes.rows[0]) {
      throw new Error("Failed to resolve seeded user.");
    }

    return {
      agencyId,
      user: userRes.rows[0],
    };
  });

  return NextResponse.json({
    ok: true,
    agency_id: result.agencyId,
    user: result.user,
    credentials: {
      email: "admin@saturate.local",
      password: "admin123!",
    },
  });
}
