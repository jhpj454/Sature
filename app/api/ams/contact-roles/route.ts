import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const ENTITY_TYPES = ["policy", "service_case"] as const;

const createContactRoleSchema = z.object({
  contact_id: z.string().uuid(),
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  role: z.string().trim().min(1),
  is_primary: z.boolean().default(false),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

const listQuerySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
});

async function assertEntityExists(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rowCount: number }> },
  entityType: (typeof ENTITY_TYPES)[number],
  entityId: string,
) {
  if (entityType === "policy") {
    const result = await client.query("SELECT 1 FROM policies WHERE id = $1 LIMIT 1", [
      entityId,
    ]);
    return result.rowCount > 0;
  }

  const result = await client.query(
    "SELECT 1 FROM service_cases WHERE id = $1 LIMIT 1",
    [entityId],
  );
  return result.rowCount > 0;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      entity_type: request.nextUrl.searchParams.get("entity_type") ?? undefined,
      entity_id: request.nextUrl.searchParams.get("entity_id") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            contact_id,
            entity_type,
            entity_id,
            role,
            is_primary,
            start_date,
            end_date,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM contact_roles
          WHERE deleted_at IS NULL
            AND entity_type = $1
            AND entity_id = $2
          ORDER BY created_at DESC
        `,
        [parsedQuery.data.entity_type, parsedQuery.data.entity_id],
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
    const parsed = createContactRoleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const created = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const contactExists = await client.query(
          `
            SELECT 1
            FROM contacts
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [parsed.data.contact_id],
        );

        if (contactExists.rowCount === 0) {
          return { error: "Contact not found." as const };
        }

        const entityExists = await assertEntityExists(
          client,
          parsed.data.entity_type,
          parsed.data.entity_id,
        );

        if (!entityExists) {
          return { error: "Entity not found." as const };
        }

        const insertRes = await client.query(
          `
            INSERT INTO contact_roles (
              agency_id,
              contact_id,
              entity_type,
              entity_id,
              role,
              is_primary,
              start_date,
              end_date,
              metadata,
              created_by,
              updated_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
          `,
          [
            session.agency_id,
            parsed.data.contact_id,
            parsed.data.entity_type,
            parsed.data.entity_id,
            parsed.data.role,
            parsed.data.is_primary,
            parsed.data.start_date ?? null,
            parsed.data.end_date ?? null,
            JSON.stringify(parsed.data.metadata),
            session.user_id,
            session.user_id,
          ],
        );

        const row = insertRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "contact_role.create",
          entityType: "contact_roles",
          entityId: row.id,
          afterJson: row,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "contact_role.created",
          entityType: "contact_role",
          entityId: row.id,
          metaJson: {
            entity_type: row.entity_type,
            entity_id: row.entity_id,
            contact_id: row.contact_id,
            role: row.role,
          },
        });

        return { data: row };
      },
    );

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
