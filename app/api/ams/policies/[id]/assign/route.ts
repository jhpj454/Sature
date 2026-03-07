import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const assignPolicySchema = z
  .object({
    producer_id: z.string().uuid().nullable().optional(),
    csr_id: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function userExistsInAgency(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  userId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [userId],
  );

  return result.rowCount > 0;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = assignPolicySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM policies
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Policy not found." as const };
      }

      const nextProducerId =
        parsed.data.producer_id !== undefined ? parsed.data.producer_id : before.producer_id;
      const nextCsrId = parsed.data.csr_id !== undefined ? parsed.data.csr_id : before.csr_id;

      if (nextProducerId !== null && nextProducerId !== undefined) {
        const producerExists = await userExistsInAgency(client, nextProducerId);
        if (!producerExists) {
          return { error: "Producer not found." as const };
        }
      }

      if (nextCsrId !== null && nextCsrId !== undefined) {
        const csrExists = await userExistsInAgency(client, nextCsrId);
        if (!csrExists) {
          return { error: "CSR not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE policies
          SET
            producer_id = $2,
            csr_id = $3
          WHERE id = $1
          RETURNING *
        `,
        [id, nextProducerId ?? null, nextCsrId ?? null],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy.assign",
        entityType: "policies",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy.assigned",
        entityType: "policy",
        entityId: id,
        metaJson: {
          producer_id: after.producer_id,
          csr_id: after.csr_id,
        },
      });

      return { data: after };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
