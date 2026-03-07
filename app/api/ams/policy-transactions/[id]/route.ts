import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";

const updateSchema = z
  .object({
    memo: z.string().nullable().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid policy transaction id." },
        { status: 400 },
      );
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            policy_id,
            transaction_type,
            transaction_date,
            effective_date,
            status,
            source,
            memo,
            data,
            commission_delta,
            cash_delta,
            revenue_event,
            premium_delta,
            fees_delta,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM policy_transactions
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [id],
      );

      return result.rows[0] ?? null;
    });

    if (!data) {
      return NextResponse.json({ error: "Policy transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid policy transaction id." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM policy_transactions
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [id],
        );

        const before = beforeRes.rows[0];
        if (!before) {
          return null;
        }

        if (before.status === "void") {
          return { error: "Void transactions cannot be updated." as const };
        }

        const nextMemo = parsed.data.memo !== undefined ? parsed.data.memo : before.memo;
        const nextData = parsed.data.data !== undefined ? parsed.data.data : before.data;

        const updateRes = await client.query(
          `
            UPDATE policy_transactions
            SET
              memo = $2,
              data = $3,
              updated_by = $4
            WHERE id = $1
            RETURNING *
          `,
          [id, nextMemo, JSON.stringify(nextData), session.user_id],
        );

        const after = updateRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "policy_transaction.update",
          entityType: "policy_transactions",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        return { data: after };
      },
    );

    if (!result) {
      return NextResponse.json({ error: "Policy transaction not found." }, { status: 404 });
    }

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
