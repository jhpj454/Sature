import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const LINE_TYPES = [
  "auto",
  "home",
  "gl",
  "wc",
  "property",
  "umbrella",
  "life",
  "health",
  "other",
] as const;

const policyLineSchema = z.object({
  line_type: z.enum(LINE_TYPES),
  state: z.string().length(2).nullable().optional(),
  limits: z.record(z.string(), z.unknown()).default({}),
  deductibles: z.record(z.string(), z.unknown()).default({}),
  exposures: z.record(z.string(), z.unknown()).default({}),
  premium: z.coerce.number().nullable().optional(),
  commission: z.coerce.number().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const createLinesSchema = z.object({
  lines: z.array(policyLineSchema).min(1),
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
      const transactionRes = await client.query(
        "SELECT id FROM policy_transactions WHERE id = $1 AND deleted_at IS NULL LIMIT 1",
        [id],
      );

      if (transactionRes.rowCount === 0) {
        return null;
      }

      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            policy_transaction_id,
            line_type,
            state,
            limits,
            deductibles,
            exposures,
            premium,
            commission,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM policy_lines
          WHERE policy_transaction_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `,
        [id],
      );

      return result.rows;
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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json(
        { error: "Invalid policy transaction id." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createLinesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const transactionRes = await client.query<{
          id: string;
          policy_id: string;
          status: string;
        }>(
          `
            SELECT id, policy_id, status
            FROM policy_transactions
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [id],
        );

        const transaction = transactionRes.rows[0];
        if (!transaction) {
          return null;
        }

        const createdRows: Record<string, unknown>[] = [];

        for (const line of parsed.data.lines) {
          const insertRes = await client.query(
            `
              INSERT INTO policy_lines (
                agency_id,
                policy_transaction_id,
                line_type,
                state,
                limits,
                deductibles,
                exposures,
                premium,
                commission,
                metadata,
                created_by,
                updated_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING *
            `,
            [
              session.agency_id,
              id,
              line.line_type,
              line.state ?? null,
              JSON.stringify(line.limits),
              JSON.stringify(line.deductibles),
              JSON.stringify(line.exposures),
              line.premium ?? null,
              line.commission ?? null,
              JSON.stringify(line.metadata),
              session.user_id,
              session.user_id,
            ],
          );

          const created = insertRes.rows[0];
          createdRows.push(created);

          await logAudit(client, {
            agencyId: session.agency_id,
            actorUserId: session.user_id,
            action: "policy_line.create",
            entityType: "policy_lines",
            entityId: String(created.id),
            afterJson: created,
            requestId: request.headers.get("x-request-id"),
            ipAddress: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          });

          await emitEvent(client, {
            agencyId: session.agency_id,
            eventType: "policy_line.created",
            entityType: "policy_line",
            entityId: String(created.id),
            metaJson: {
              policy_transaction_id: id,
              policy_id: transaction.policy_id,
              line_type: created.line_type,
            },
          });
        }

        return createdRows;
      },
    );

    if (!result) {
      return NextResponse.json({ error: "Policy transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
