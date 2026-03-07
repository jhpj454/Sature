import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const createPolicySchema = z.object({
  account_id: z.string().uuid(),
  carrier_id: z.string().uuid().nullable().optional(),
  lob: z.string().min(1),
  policy_number: z.string().min(1),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["quoted", "active", "canceled", "expired", "pending"]),
  billing_type: z.enum(["direct_bill", "agency_bill"]),
  premium_amount: z.coerce.number(),
  commission_estimate_amount: z.coerce.number(),
  agency_fee_amount: z.coerce.number().default(0),
  agency_revenue_estimate_amount: z.coerce.number(),
  assigned_csr_id: z.string().uuid().nullable().optional(),
  producer_id: z.string().uuid().nullable().optional(),
  csr_id: z.string().uuid().nullable().optional(),
});

const listPoliciesQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiring_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiring_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z
    .enum(["quoted", "active", "canceled", "expired", "pending"])
    .optional(),
  account_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

async function tenantEntityExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  table: "accounts" | "carriers",
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
    const parsedQuery = listPoliciesQuerySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      expiring_after: request.nextUrl.searchParams.get("expiring_after") ?? undefined,
      expiring_before: request.nextUrl.searchParams.get("expiring_before") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      account_id: request.nextUrl.searchParams.get("account_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const { from, to, expiring_after, expiring_before, status, account_id, page, page_size } =
      parsedQuery.data;
    const effectiveFrom = from ?? expiring_after ?? null;
    const effectiveTo = to ?? expiring_before ?? null;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const rowsRes = await client.query(
        `
          SELECT
            id,
            agency_id,
            account_id,
            carrier_id,
            lob,
            policy_number,
            effective_date,
            expiration_date,
            status,
            billing_type,
            premium_amount,
            commission_estimate_amount,
            agency_fee_amount,
            agency_revenue_estimate_amount,
            assigned_csr_id,
            producer_id,
            csr_id,
            commission_expected,
            commission_received,
            revenue_status,
            renewal_status,
            renewal_assigned_to,
            renewal_last_touch_at,
            renewal_next_action_at,
            created_at,
            updated_at
          FROM policies
          WHERE agency_id = $1
            AND ($2::date IS NULL OR expiration_date >= $2)
            AND ($3::date IS NULL OR expiration_date <= $3)
            AND ($4::text IS NULL OR status::text = $4)
            AND ($5::uuid IS NULL OR account_id = $5)
          ORDER BY created_at DESC
          LIMIT $6 OFFSET $7
        `,
        [
          session.agency_id,
          effectiveFrom,
          effectiveTo,
          status ?? null,
          account_id ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM policies
          WHERE agency_id = $1
            AND ($2::date IS NULL OR expiration_date >= $2)
            AND ($3::date IS NULL OR expiration_date <= $3)
            AND ($4::text IS NULL OR status::text = $4)
            AND ($5::uuid IS NULL OR account_id = $5)
        `,
        [session.agency_id, effectiveFrom, effectiveTo, status ?? null, account_id ?? null],
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
    const parsed = createPolicySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const policy = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const accountExists = await tenantEntityExists(
          client,
          "accounts",
          parsed.data.account_id,
          session.agency_id,
        );
        if (!accountExists) {
          return { error: "Account not found." as const };
        }

        if (parsed.data.carrier_id) {
          const carrierExists = await tenantEntityExists(
            client,
            "carriers",
            parsed.data.carrier_id,
            session.agency_id,
          );
          if (!carrierExists) {
            return { error: "Carrier not found." as const };
          }
        }

        const assignedCsrId = parsed.data.assigned_csr_id ?? parsed.data.csr_id ?? null;

        if (parsed.data.producer_id) {
          const producerExists = await activeUserExists(
            client,
            parsed.data.producer_id,
            session.agency_id,
          );
          if (!producerExists) {
            return { error: "Producer not found." as const };
          }
        }

        if (assignedCsrId) {
          const csrExists = await activeUserExists(
            client,
            assignedCsrId,
            session.agency_id,
          );
          if (!csrExists) {
            return { error: "CSR not found." as const };
          }
        }

        const result = await client.query(
          `
            INSERT INTO policies (
              agency_id,
              account_id,
              carrier_id,
              lob,
              policy_number,
              effective_date,
              expiration_date,
              status,
              billing_type,
              premium_amount,
              commission_estimate_amount,
              agency_fee_amount,
              agency_revenue_estimate_amount,
              assigned_csr_id,
              producer_id,
              csr_id
            ) VALUES (
              $1, $2, $3, $4, $5,
              $6, $7, $8, $9, $10,
              $11, $12, $13, $14, $15, $16
            )
            RETURNING *
          `,
          [
            session.agency_id,
            parsed.data.account_id,
            parsed.data.carrier_id ?? null,
            parsed.data.lob,
            parsed.data.policy_number,
            parsed.data.effective_date,
            parsed.data.expiration_date,
            parsed.data.status,
            parsed.data.billing_type,
            parsed.data.premium_amount,
            parsed.data.commission_estimate_amount,
            parsed.data.agency_fee_amount,
            parsed.data.agency_revenue_estimate_amount,
            assignedCsrId,
            parsed.data.producer_id ?? null,
            parsed.data.csr_id ?? assignedCsrId,
          ],
        );

        const created = result.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "policy.create",
          entityType: "policy",
          entityId: created.id,
          afterJson: created,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "policy.created",
          entityType: "policy",
          entityId: created.id,
          metaJson: {
            premium_amount: created.premium_amount,
            commission_estimate_amount: created.commission_estimate_amount,
            agency_fee_amount: created.agency_fee_amount,
            agency_revenue_estimate_amount:
              created.agency_revenue_estimate_amount,
          },
        });

        return created;
      },
    );

    if ("error" in policy) {
      return NextResponse.json({ error: policy.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: policy }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
