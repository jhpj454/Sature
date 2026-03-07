import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import { normalizeServiceCasePriority } from "@/src/server/automation/timeTriggers.mjs";

const createServiceCaseSchema = z.object({
  case_type: z.enum([
    "endorsement",
    "renewal",
    "coi",
    "claim",
    "billing",
    "cancellation",
    "other",
  ]),
  status: z.enum(["open", "in_progress", "waiting", "done", "closed"]),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  account_id: z.string().uuid().nullable().optional(),
  policy_id: z.string().uuid().nullable().optional(),
  transaction_id: z.string().uuid().nullable().optional(),
  assigned_to_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sla_due_at: z.string().datetime().nullable().optional(),
  title: z.string().min(1),
});

const listServiceCasesQuerySchema = z.object({
  status: z.enum(["open", "in_progress", "waiting", "done", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  policy_id: z.string().uuid().optional(),
  account_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

async function tenantEntityExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  table: "accounts" | "policies" | "policy_transactions",
  id: string,
  agencyId: string,
) {
  const result = await client.query(
    `SELECT 1 FROM ${table} WHERE id = $1 AND agency_id = $2 LIMIT 1`,
    [id, agencyId],
  );
  return result.rowCount > 0;
}

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

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listServiceCasesQuerySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      priority: request.nextUrl.searchParams.get("priority") ?? undefined,
      assigned_to_user_id:
        request.nextUrl.searchParams.get("assigned_to_user_id") ?? undefined,
      policy_id: request.nextUrl.searchParams.get("policy_id") ?? undefined,
      account_id: request.nextUrl.searchParams.get("account_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const {
      status,
      priority,
      assigned_to_user_id,
      policy_id,
      account_id,
      page,
      page_size,
    } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const rowsRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            case_type,
            status,
            priority,
            account_id,
            policy_id,
            transaction_id,
            assigned_to_user_id,
            due_date,
            sla_due_at,
            title,
            dedupe_key,
            deleted_at,
            created_at,
            updated_at
          FROM service_cases
          WHERE agency_id = $1
            AND deleted_at IS NULL
            AND ($2::text IS NULL OR status::text = $2)
            AND ($3::text IS NULL OR priority::text = $3)
            AND ($4::uuid IS NULL OR assigned_to_user_id = $4)
            AND ($5::uuid IS NULL OR policy_id = $5)
            AND ($6::uuid IS NULL OR account_id = $6)
          ORDER BY created_at DESC
          LIMIT $7 OFFSET $8
        `,
        [
          session.agency_id,
          status ?? null,
          priority ?? null,
          assigned_to_user_id ?? null,
          policy_id ?? null,
          account_id ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM service_cases
          WHERE agency_id = $1
            AND deleted_at IS NULL
            AND ($2::text IS NULL OR status::text = $2)
            AND ($3::text IS NULL OR priority::text = $3)
            AND ($4::uuid IS NULL OR assigned_to_user_id = $4)
            AND ($5::uuid IS NULL OR policy_id = $5)
            AND ($6::uuid IS NULL OR account_id = $6)
        `,
        [
          session.agency_id,
          status ?? null,
          priority ?? null,
          assigned_to_user_id ?? null,
          policy_id ?? null,
          account_id ?? null,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: data.rows,
      pagination: {
        page,
        page_size,
        total: data.total,
      },
    });
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
    const parsed = createServiceCaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const serviceCase = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        if (parsed.data.account_id) {
          const accountExists = await tenantEntityExists(
            client,
            "accounts",
            parsed.data.account_id,
            session.agency_id,
          );
          if (!accountExists) {
            return { error: "Account not found." as const };
          }
        }

        if (parsed.data.policy_id) {
          const policyExists = await tenantEntityExists(
            client,
            "policies",
            parsed.data.policy_id,
            session.agency_id,
          );
          if (!policyExists) {
            return { error: "Policy not found." as const };
          }
        }

        if (parsed.data.transaction_id) {
          const txExists = await tenantEntityExists(
            client,
            "policy_transactions",
            parsed.data.transaction_id,
            session.agency_id,
          );
          if (!txExists) {
            return { error: "Transaction not found." as const };
          }
        }

        if (parsed.data.assigned_to_user_id) {
          const assigneeExists = await activeUserExists(
            client,
            parsed.data.assigned_to_user_id,
            session.agency_id,
          );
          if (!assigneeExists) {
            return { error: "Assigned user not found." as const };
          }
        }

        const result = await client.query(
          `
            INSERT INTO service_cases (
              agency_id,
              case_type,
              status,
              priority,
              account_id,
              policy_id,
              transaction_id,
              assigned_to_user_id,
              due_date,
              sla_due_at,
              title
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
          `,
          [
            session.agency_id,
            parsed.data.case_type,
            parsed.data.status,
            normalizeServiceCasePriority(parsed.data.priority),
            parsed.data.account_id ?? null,
            parsed.data.policy_id ?? null,
            parsed.data.transaction_id ?? null,
            parsed.data.assigned_to_user_id ?? null,
            parsed.data.due_date ?? null,
            parsed.data.sla_due_at ?? null,
            parsed.data.title,
          ],
        );

        const created = result.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "service_case.create",
          entityType: "service_case",
          entityId: created.id,
          afterJson: created,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "service_case.created",
          entityType: "service_case",
          entityId: created.id,
          metaJson: {
            case_type: created.case_type,
            status: created.status,
            priority: created.priority,
          },
        });

        return created;
      },
    );

    if ("error" in serviceCase) {
      return NextResponse.json({ error: serviceCase.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: serviceCase }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
