import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

const patchSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  role: z.enum(["producer", "csr", "marketing", "admin"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    if (!parsed.data.display_name && !parsed.data.role && !parsed.data.status) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      if (session.role !== "admin") {
        return { error: "Forbidden" as const };
      }

      if (id === session.user_id && parsed.data.status === "suspended") {
        return { error: "SELF_SUSPEND" as const };
      }

      const setClauses: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (parsed.data.display_name) {
        setClauses.push(`display_name = $${idx++}`);
        values.push(parsed.data.display_name);
      }
      if (parsed.data.role) {
        setClauses.push(`role = $${idx++}`);
        values.push(parsed.data.role);
      }
      if (parsed.data.status) {
        setClauses.push(`status = $${idx++}`);
        values.push(parsed.data.status);
      }

      values.push(id);

      const updated = await client.query(
        `
          UPDATE users
          SET ${setClauses.join(", ")}
          WHERE id = $${idx}
            AND agency_id = current_setting('app.current_agency_id', true)::uuid
          RETURNING id, display_name, email, role, status, last_login_at, created_at
        `,
        values,
      );

      if (updated.rows.length === 0) {
        return { error: "NOT_FOUND" as const };
      }

      return { user: updated.rows[0] };
    });

    if (!result || "error" in result) {
      if (result?.error === "NOT_FOUND") {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      if (result?.error === "SELF_SUSPEND") {
        return NextResponse.json({ error: "You cannot suspend your own account." }, { status: 400 });
      }
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, data: result.user });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
