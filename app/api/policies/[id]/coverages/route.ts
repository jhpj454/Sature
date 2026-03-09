import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const DEDUCTIBLE_TYPES = ["flat", "percentage"] as const;

const createSchema = z.object({
  coverage_type: z.string().min(1),
  description: z.string().nullable().optional(),
  deductible: z.coerce.number().nullable().optional(),
  deductible_type: z.enum(DEDUCTIBLE_TYPES).nullable().optional(),
  effective_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  expiration_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

async function policyExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  policyId: string,
) {
  const result = await client.query(
    `SELECT 1 FROM policies WHERE id = $1 LIMIT 1`,
    [policyId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id, agency_id, policy_id, coverage_type, description,
            deductible, deductible_type, effective_date, expiration_date,
            created_at, updated_at
          FROM policy_coverages
          WHERE policy_id = $1
          ORDER BY created_at DESC
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      const exists = await policyExists(client, id);
      if (!exists) {
        return { error: "Policy not found." as const };
      }

      const insertRes = await client.query(
        `
          INSERT INTO policy_coverages (
            agency_id, policy_id, coverage_type, description,
            deductible, deductible_type, effective_date, expiration_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          session.agency_id,
          id,
          parsed.data.coverage_type,
          parsed.data.description ?? null,
          parsed.data.deductible ?? null,
          parsed.data.deductible_type ?? null,
          parsed.data.effective_date ?? null,
          parsed.data.expiration_date ?? null,
        ],
      );

      const row = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_coverage.create",
        entityType: "policy_coverages",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_coverage.created",
        entityType: "policy_coverage",
        entityId: row.id,
        metaJson: { policy_id: id, coverage_type: row.coverage_type },
      });

      return { data: row };
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
