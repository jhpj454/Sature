import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid producer payout id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM producer_payouts
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
        return { data: before };
      }

      const updateRes = await client.query(
        `
          UPDATE producer_payouts
          SET
            status = 'void',
            updated_by = $2
          WHERE id = $1
          RETURNING *
        `,
        [id, session.user_id],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "producer_payout.void",
        entityType: "producer_payouts",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "payout.voided",
        entityType: "producer_payout",
        entityId: id,
        metaJson: {
          producer_id: after.producer_id,
          amount: after.amount,
          payout_date: after.payout_date,
        },
      });

      return { data: after };
    });

    if (!result) {
      return NextResponse.json({ error: "Producer payout not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
