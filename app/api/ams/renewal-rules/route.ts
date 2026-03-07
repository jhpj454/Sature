import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const CASE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

const createRenewalRuleSchema = z.object({
  is_enabled: z.boolean().default(true),
  days_before_expiration: z.coerce.number().int().min(1).max(365),
  create_case: z.boolean().default(true),
  case_priority: z.enum(CASE_PRIORITIES).default("normal"),
  assign_to: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

async function activeUserExists(
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

export async function GET(request: NextRequest) {
  try {
    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            is_enabled,
            days_before_expiration,
            create_case,
            case_priority,
            assign_to,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM renewal_rules
          WHERE deleted_at IS NULL
          ORDER BY days_before_expiration DESC, created_at DESC
        `,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createRenewalRuleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      if (parsed.data.assign_to) {
        const assigneeExists = await activeUserExists(client, parsed.data.assign_to);
        if (!assigneeExists) {
          return { error: "Assigned user not found." as const };
        }
      }

      const insertRes = await client.query(
        `
          INSERT INTO renewal_rules (
            agency_id,
            is_enabled,
            days_before_expiration,
            create_case,
            case_priority,
            assign_to,
            metadata,
            created_by,
            updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.is_enabled,
          parsed.data.days_before_expiration,
          parsed.data.create_case,
          parsed.data.case_priority,
          parsed.data.assign_to ?? null,
          JSON.stringify(parsed.data.metadata),
          session.user_id,
          session.user_id,
        ],
      );

      const row = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "renewal_rule.create",
        entityType: "renewal_rules",
        entityId: row.id,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "renewal_rule.created",
        entityType: "renewal_rule",
        entityId: row.id,
        metaJson: {
          is_enabled: row.is_enabled,
          days_before_expiration: row.days_before_expiration,
          create_case: row.create_case,
          case_priority: row.case_priority,
          assign_to: row.assign_to,
        },
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
