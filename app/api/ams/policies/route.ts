import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

const POLICY_STATUSES = ["quoted", "active", "canceled", "expired", "pending"] as const;
const DEFAULT_POLICY_STATUSES: ReadonlyArray<(typeof POLICY_STATUSES)[number]> = [
  "active",
  "pending",
  "quoted",
];

const querySchema = z.object({
  status: z.string().optional(),
  expiring_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiring_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  assigned_to: z.string().optional(),
  account_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

const VALID_STATUS_SET = new Set<string>(POLICY_STATUSES);

function parseStatusFilter(rawStatus: string | undefined) {
  if (!rawStatus) {
    return [...DEFAULT_POLICY_STATUSES];
  }

  const parsed = rawStatus
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (parsed.length === 0) {
    return [...DEFAULT_POLICY_STATUSES];
  }

  const invalid = parsed.find((value) => !VALID_STATUS_SET.has(value));
  if (invalid) {
    return null;
  }

  return parsed as (typeof POLICY_STATUSES)[number][];
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = querySchema.safeParse({
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      expiring_after: request.nextUrl.searchParams.get("expiring_after") ?? undefined,
      expiring_before: request.nextUrl.searchParams.get("expiring_before") ?? undefined,
      assigned_to: request.nextUrl.searchParams.get("assigned_to") ?? undefined,
      account_id: request.nextUrl.searchParams.get("account_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const statuses = parseStatusFilter(parsedQuery.data.status);
    if (!statuses) {
      return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    }

    const { expiring_after, expiring_before, assigned_to, account_id, page, page_size } =
      parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      let assignedToFilter: string | null = null;
      if (assigned_to === "me") {
        assignedToFilter = session.user_id;
      } else if (assigned_to) {
        if (!z.uuid().safeParse(assigned_to).success) {
          return { error: "Invalid assigned_to filter." as const };
        }
        assignedToFilter = assigned_to;
      }

      const rowsRes = await client.query(
        `
          SELECT
            p.id,
            p.policy_number,
            p.lob,
            p.status,
            p.effective_date,
            p.expiration_date,
            p.agency_revenue_estimate_amount,
            p.account_id,
            a.account_name,
            p.carrier_id,
            c.name AS carrier_name,
            p.assigned_csr_id
          FROM policies p
          LEFT JOIN accounts a
            ON a.id = p.account_id
           AND a.agency_id = p.agency_id
          LEFT JOIN carriers c
            ON c.id = p.carrier_id
           AND c.agency_id = p.agency_id
           AND c.deleted_at IS NULL
          WHERE p.agency_id = $1
            AND ($2::date IS NULL OR p.expiration_date >= $2)
            AND ($3::date IS NULL OR p.expiration_date <= $3)
            AND (p.status::text = ANY($4::text[]))
            AND ($5::uuid IS NULL OR p.assigned_csr_id = $5)
            AND ($6::uuid IS NULL OR p.account_id = $6)
          ORDER BY p.expiration_date ASC, p.created_at DESC
          LIMIT $7 OFFSET $8
        `,
        [
          session.agency_id,
          expiring_after ?? null,
          expiring_before ?? null,
          statuses,
          assignedToFilter,
          account_id ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM policies p
          WHERE p.agency_id = $1
            AND ($2::date IS NULL OR p.expiration_date >= $2)
            AND ($3::date IS NULL OR p.expiration_date <= $3)
            AND (p.status::text = ANY($4::text[]))
            AND ($5::uuid IS NULL OR p.assigned_csr_id = $5)
            AND ($6::uuid IS NULL OR p.account_id = $6)
        `,
        [
          session.agency_id,
          expiring_after ?? null,
          expiring_before ?? null,
          statuses,
          assignedToFilter,
          account_id ?? null,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    if ("error" in data) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

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
