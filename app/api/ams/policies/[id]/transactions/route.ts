import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import { applyPolicyTransactionAccounting } from "@/src/server/policy-transaction-accounting";
import { createActivity } from "@/src/server/entity-writes";

const TRANSACTION_TYPES = [
  "new_business",
  "renewal",
  "endorsement",
  "cancellation",
  "reinstatement",
  "rewrite",
  "billing_change",
  "commission_adj",
  "payment",
  "refund",
] as const;

const STATUSES = ["posted", "pending", "void"] as const;
const SOURCES = ["manual", "import", "integration"] as const;
const REVENUE_EVENTS = ["earned", "paid", "chargeback", "none"] as const;
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

const createTransactionSchema = z.object({
  transaction_type: z.enum(TRANSACTION_TYPES),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(STATUSES).default("posted"),
  source: z.enum(SOURCES).default("manual"),
  memo: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  commission_delta: z.coerce.number().default(0),
  cash_delta: z.coerce.number().default(0),
  revenue_event: z.enum(REVENUE_EVENTS).default("none"),
  premium_delta: z.coerce.number().nullable().optional(),
  fees_delta: z.coerce.number().nullable().optional(),
  lines: z.array(policyLineSchema).optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
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
          WHERE policy_id = $1
            AND deleted_at IS NULL
          ORDER BY transaction_date DESC, created_at DESC
        `,
        [id],
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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const policyRes = await client.query(
          `
            SELECT *
            FROM policies
            WHERE id = $1
            LIMIT 1
            FOR UPDATE
          `,
          [id],
        );

        const policy = policyRes.rows[0];
        if (!policy) {
          return { error: "Policy not found." as const };
        }

        const insertRes = await client.query(
          `
            INSERT INTO policy_transactions (
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
              created_by,
              updated_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16
            )
            RETURNING *
          `,
          [
            session.agency_id,
            id,
            parsed.data.transaction_type,
            parsed.data.transaction_date,
            parsed.data.effective_date ?? null,
            parsed.data.status,
            parsed.data.source,
            parsed.data.memo ?? null,
            JSON.stringify(parsed.data.data),
            parsed.data.commission_delta,
            parsed.data.cash_delta,
            parsed.data.revenue_event,
            parsed.data.premium_delta ?? null,
            parsed.data.fees_delta ?? null,
            session.user_id,
            session.user_id,
          ],
        );

        const inserted = insertRes.rows[0];
        const insertedLines: Record<string, unknown>[] = [];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "policy_transaction.create",
          entityType: "policy_transactions",
          entityId: inserted.id,
          afterJson: inserted,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        const accountingResult =
          inserted.status === "posted"
            ? await applyPolicyTransactionAccounting({
                client,
                agencyId: session.agency_id,
                actorUserId: session.user_id,
                transaction: inserted,
                action: "posted",
                meta: {
                  requestId: request.headers.get("x-request-id"),
                  ipAddress: request.headers.get("x-forwarded-for"),
                  userAgent: request.headers.get("user-agent"),
                },
              })
            : { updatedPolicy: null };

        if (parsed.data.lines && parsed.data.lines.length > 0) {
          for (const line of parsed.data.lines) {
            const lineRes = await client.query(
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
                inserted.id,
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

            const createdLine = lineRes.rows[0];
            insertedLines.push(createdLine);

            await logAudit(client, {
              agencyId: session.agency_id,
              actorUserId: session.user_id,
              action: "policy_line.create",
              entityType: "policy_lines",
              entityId: createdLine.id,
              afterJson: createdLine,
              requestId: request.headers.get("x-request-id"),
              ipAddress: request.headers.get("x-forwarded-for"),
              userAgent: request.headers.get("user-agent"),
            });

            await emitEvent(client, {
              agencyId: session.agency_id,
              eventType: "policy_line.created",
              entityType: "policy_line",
              entityId: createdLine.id,
              metaJson: {
                policy_id: id,
                policy_transaction_id: inserted.id,
                line_type: createdLine.line_type,
              },
            });
          }
        }

        const activity = await createActivity(
          {
            client,
            session,
            meta: {
              requestId: request.headers.get("x-request-id"),
              ipAddress: request.headers.get("x-forwarded-for"),
              userAgent: request.headers.get("user-agent"),
            },
          },
          {
            entity_type: "policy",
            entity_id: id,
            activity_type: "system",
            summary: inserted.memo ?? `${inserted.transaction_type} transaction posted`,
            details: {
              transaction_id: inserted.id,
              status: inserted.status,
            },
          },
        );

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "policy_transaction.created",
          entityType: "policy_transaction",
          entityId: inserted.id,
          metaJson: {
            policy_id: id,
            transaction_type: inserted.transaction_type,
            status: inserted.status,
          },
        });

        return {
          transaction: inserted,
          lines: insertedLines,
          policy: accountingResult.updatedPolicy,
          activity,
        };
      },
    );

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
