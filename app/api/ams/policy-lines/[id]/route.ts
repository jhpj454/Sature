import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy line id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const lineRes = await client.query(
          `
            SELECT *
            FROM policy_lines
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [id],
        );

        const line = lineRes.rows[0];
        if (!line) {
          return null;
        }

        const transactionRes = await client.query<{ status: string; policy_id: string }>(
          `
            SELECT status, policy_id
            FROM policy_transactions
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [line.policy_transaction_id],
        );

        const transaction = transactionRes.rows[0];
        if (!transaction) {
          return { error: "Policy transaction not found." as const };
        }

        if (transaction.status !== "pending") {
          return {
            error: "Policy lines can only be deleted for pending transactions." as const,
          };
        }

        const deleteRes = await client.query(
          `
            UPDATE policy_lines
            SET
              deleted_at = now(),
              updated_by = $2
            WHERE id = $1
            RETURNING *
          `,
          [id, session.user_id],
        );

        const after = deleteRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "policy_line.delete",
          entityType: "policy_lines",
          entityId: id,
          beforeJson: line,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "policy_line.deleted",
          entityType: "policy_line",
          entityId: id,
          metaJson: {
            policy_transaction_id: line.policy_transaction_id,
            policy_id: transaction.policy_id,
            line_type: line.line_type,
          },
        });

        return { data: after };
      },
    );

    if (!result) {
      return NextResponse.json({ error: "Policy line not found." }, { status: 404 });
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
