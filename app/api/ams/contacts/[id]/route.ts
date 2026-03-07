import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const CONTACT_TYPES = ["person", "business"] as const;
const CONTACT_STATUSES = ["active", "inactive"] as const;

const updateContactSchema = z
  .object({
    contact_type: z.enum(CONTACT_TYPES).optional(),
    first_name: z.string().trim().min(1).nullable().optional(),
    last_name: z.string().trim().min(1).nullable().optional(),
    business_name: z.string().trim().min(1).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    address: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(CONTACT_STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

function validateNameRules(data: {
  contact_type: (typeof CONTACT_TYPES)[number];
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
}) {
  if (data.contact_type === "person") {
    if (!data.first_name && !data.last_name) {
      return "Person contacts require first_name or last_name.";
    }
  }

  if (data.contact_type === "business" && !data.business_name) {
    return "Business contacts require business_name.";
  }

  return null;
}

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid contact id." }, { status: 400 });
    }

    const contact = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const result = await client.query(
          `
            SELECT
              id,
              agency_id,
              contact_type,
              first_name,
              last_name,
              business_name,
              email,
              phone,
              address,
              tags,
              status,
              metadata,
              created_at,
              created_by,
              updated_at,
              updated_by,
              deleted_at
            FROM contacts
            WHERE id = $1
              AND agency_id = $2
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [id, session.agency_id],
        );

        return result.rows[0] ?? null;
      },
    );

    if (!contact) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: contact });
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
      return NextResponse.json({ error: "Invalid contact id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM contacts
            WHERE id = $1
              AND agency_id = $2
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [id, session.agency_id],
        );

        const before = beforeRes.rows[0];
        if (!before) {
          return null;
        }

        const next = {
          contact_type: parsed.data.contact_type ?? before.contact_type,
          first_name:
            parsed.data.first_name !== undefined
              ? parsed.data.first_name
              : before.first_name,
          last_name:
            parsed.data.last_name !== undefined
              ? parsed.data.last_name
              : before.last_name,
          business_name:
            parsed.data.business_name !== undefined
              ? parsed.data.business_name
              : before.business_name,
          email: parsed.data.email !== undefined ? parsed.data.email : before.email,
          phone: parsed.data.phone !== undefined ? parsed.data.phone : before.phone,
          address:
            parsed.data.address !== undefined ? parsed.data.address : before.address,
          tags: parsed.data.tags !== undefined ? parsed.data.tags : before.tags,
          status: parsed.data.status ?? before.status,
          metadata:
            parsed.data.metadata !== undefined ? parsed.data.metadata : before.metadata,
        };

        const nameRuleError = validateNameRules({
          contact_type: next.contact_type,
          first_name: next.first_name,
          last_name: next.last_name,
          business_name: next.business_name,
        });

        if (nameRuleError) {
          return {
            validationError: nameRuleError,
          };
        }

        const updateRes = await client.query(
          `
            UPDATE contacts
            SET
              contact_type = $2,
              first_name = $3,
              last_name = $4,
              business_name = $5,
              email = $6,
              phone = $7,
              address = $8,
              tags = $9,
              status = $10,
              metadata = $11,
              updated_by = $12
            WHERE id = $1
              AND agency_id = $13
            RETURNING *
          `,
          [
            id,
            next.contact_type,
            next.first_name,
            next.last_name,
            next.business_name,
            next.email,
            next.phone,
            JSON.stringify(next.address),
            next.tags,
            next.status,
            JSON.stringify(next.metadata),
            session.user_id,
            session.agency_id,
          ],
        );

        const after = updateRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "contact.update",
          entityType: "contacts",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "contact.updated",
          entityType: "contact",
          entityId: id,
          metaJson: {
            contact_type: after.contact_type,
            email: after.email,
          },
        });

        return {
          data: after,
        };
      },
    );

    if (!updated) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    if ("validationError" in updated) {
      return NextResponse.json(
        { error: updated.validationError },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid contact id." }, { status: 400 });
    }

    const deleted = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM contacts
            WHERE id = $1
              AND agency_id = $2
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [id, session.agency_id],
        );

        const before = beforeRes.rows[0];
        if (!before) {
          return null;
        }

        const deleteRes = await client.query(
          `
            UPDATE contacts
            SET
              deleted_at = now(),
              updated_by = $2
            WHERE id = $1
              AND agency_id = $3
            RETURNING *
          `,
          [id, session.user_id, session.agency_id],
        );

        const after = deleteRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "contact.delete",
          entityType: "contacts",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "contact.deleted",
          entityType: "contact",
          entityId: id,
          metaJson: {
            contact_type: before.contact_type,
            email: before.email,
            deleted_at: after.deleted_at,
          },
        });

        return after;
      },
    );

    if (!deleted) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: deleted });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
