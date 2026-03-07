import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const updateAccountSchema = z
  .object({
    account_type: z.enum(["commercial", "personal"]).optional(),
    account_name: z.string().min(1).optional(),
    status: z.enum(["prospect", "client", "lost"]).optional(),
    assigned_producer_id: z.string().uuid().nullable().optional(),
    assigned_csr_id: z.string().uuid().nullable().optional(),
    industry_segment: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function activeUserExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  userId: string,
  agencyId: string,
) {
  const result = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND agency_id = $2
        AND status = 'active'
      LIMIT 1
    `,
    [userId, agencyId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
    }

    const account = await withTenantClientFromRequest(request, async (client, session) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            account_type,
            account_name,
            status,
            assigned_producer_id,
            assigned_csr_id,
            industry_segment,
            notes,
            created_at,
            updated_at
          FROM accounts
          WHERE id = $1
            AND agency_id = $2
          LIMIT 1
        `,
        [id, session.agency_id],
      );

      return result.rows[0] ?? null;
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: account });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid account id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT *
          FROM accounts
          WHERE id = $1
            AND agency_id = $2
          LIMIT 1
          FOR UPDATE
        `,
        [id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Account not found." as const };
      }

      const nextProducerId =
        parsed.data.assigned_producer_id !== undefined
          ? parsed.data.assigned_producer_id
          : before.assigned_producer_id;
      const nextCsrId =
        parsed.data.assigned_csr_id !== undefined
          ? parsed.data.assigned_csr_id
          : before.assigned_csr_id;

      if (nextProducerId) {
        const producerExists = await activeUserExists(
          client,
          nextProducerId,
          session.agency_id,
        );
        if (!producerExists) {
          return { error: "Assigned producer not found." as const };
        }
      }

      if (nextCsrId) {
        const csrExists = await activeUserExists(client, nextCsrId, session.agency_id);
        if (!csrExists) {
          return { error: "Assigned CSR not found." as const };
        }
      }

      const updateRes = await client.query(
        `
          UPDATE accounts
          SET
            account_type = $2,
            account_name = $3,
            status = $4,
            assigned_producer_id = $5,
            assigned_csr_id = $6,
            industry_segment = $7,
            notes = $8
          WHERE id = $1
            AND agency_id = $9
          RETURNING *
        `,
        [
          id,
          parsed.data.account_type ?? before.account_type,
          parsed.data.account_name ?? before.account_name,
          parsed.data.status ?? before.status,
          nextProducerId ?? null,
          nextCsrId ?? null,
          parsed.data.industry_segment !== undefined
            ? parsed.data.industry_segment
            : before.industry_segment,
          parsed.data.notes !== undefined ? parsed.data.notes : before.notes,
          session.agency_id,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "account.update",
        entityType: "account",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "account.updated",
        entityType: "account",
        entityId: id,
        metaJson: {
          account_name: after.account_name,
          status: after.status,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const status =
        updated.error === "Account not found."
          ? 404
          : 400;
      return NextResponse.json({ error: updated.error }, { status });
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
