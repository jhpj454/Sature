import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

const createSchema = z.object({
  display_name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["producer", "csr", "marketing", "admin"]),
});

export async function GET(request: NextRequest) {
  try {
    const data = await withTenantClientFromRequest(request, async (client, session) => {
      if (session.role !== "admin") {
        throw new UnauthorizedError("Forbidden");
      }

      const result = await client.query(
        `
          SELECT
            id,
            display_name,
            email,
            role,
            status,
            last_login_at,
            created_at
          FROM users
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      if (session.role !== "admin") {
        return { error: "Forbidden" as const };
      }

      const existing = await client.query(
        `
          SELECT id FROM users
          WHERE agency_id = current_setting('app.current_agency_id', true)::uuid
            AND email = $1
          LIMIT 1
        `,
        [parsed.data.email.toLowerCase()],
      );

      if (existing.rows.length > 0) {
        return { error: "EMAIL_TAKEN" as const };
      }

      const tempPassword = crypto.randomBytes(5).toString("hex"); // 10-char hex
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const inserted = await client.query(
        `
          INSERT INTO users (agency_id, email, password_hash, display_name, role, status)
          VALUES (
            current_setting('app.current_agency_id', true)::uuid,
            $1, $2, $3, $4, 'active'
          )
          RETURNING id, display_name, email, role, status, created_at
        `,
        [
          parsed.data.email.toLowerCase(),
          passwordHash,
          parsed.data.display_name,
          parsed.data.role,
        ],
      );

      return { user: inserted.rows[0], tempPassword };
    });

    if (!result || "error" in result) {
      if (result?.error === "EMAIL_TAKEN") {
        return NextResponse.json(
          { error: "A user with that email already exists." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
