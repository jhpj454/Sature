import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { applyPolicyTransactionAccounting } from "@/src/server/policy-transaction-accounting";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid policy transaction id." },
        { status: 400 },
      );
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
          return { error: "Policy transaction already void." as const };
        }

        const voidRes = await client.query(
          `
            UPDATE policy_transactions
            SET
              status = 'void',
              updated_by = $2
            WHERE id = $1
            RETURNING *
          `,
          [id, session.user_id],
        );

        const after = voidRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "policy_transaction.void",
          entityType: "policy_transactions",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        const accountingResult = await applyPolicyTransactionAccounting({
          client,
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          transaction: after,
          action: "voided",
          previousStatus: before.status,
          meta: {
            requestId: request.headers.get("x-request-id"),
            ipAddress: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          },
        });

        return { data: after, policy: accountingResult.updatedPolicy };
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
