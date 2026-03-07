import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const INTEGRATION_STATUSES = ["none", "pending", "connected", "error"] as const;

const updateCarrierSchema = z
  .object({
    name: z.string().min(1).optional(),
    naic_code: z.string().min(1).nullable().optional(),
    producer_code: z.string().min(1).nullable().optional(),
    integration_status: z.enum(INTEGRATION_STATUSES).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid carrier id." }, { status: 400 });
    }

    const carrier = await withTenantClientFromRequest(
      request,
      async (client) => {
        const result = await client.query(
          `
            SELECT
              id,
              agency_id,
              name,
              naic_code,
              producer_code,
              integration_status,
              metadata,
              created_at,
              created_by,
              updated_at,
              updated_by,
              deleted_at
            FROM carriers
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
          `,
          [id],
        );

        return result.rows[0] ?? null;
      },
    );

    if (!carrier) {
      return NextResponse.json({ error: "Carrier not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: carrier });
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
      return NextResponse.json({ error: "Invalid carrier id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateCarrierSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM carriers
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [id],
        );

        const before = beforeRes.rows[0];
        if (!before) {
          return null;
        }

        const nextName = parsed.data.name ?? before.name;
        const nextNaicCode =
          parsed.data.naic_code !== undefined ? parsed.data.naic_code : before.naic_code;
        const nextProducerCode =
          parsed.data.producer_code !== undefined
            ? parsed.data.producer_code
            : before.producer_code;
        const nextIntegrationStatus =
          parsed.data.integration_status ?? before.integration_status;
        const nextMetadata =
          parsed.data.metadata !== undefined ? parsed.data.metadata : before.metadata;

        const updateRes = await client.query(
          `
            UPDATE carriers
            SET
              name = $2,
              naic_code = $3,
              producer_code = $4,
              integration_status = $5,
              metadata = $6,
              updated_by = $7
            WHERE id = $1
            RETURNING *
          `,
          [
            id,
            nextName,
            nextNaicCode,
            nextProducerCode,
            nextIntegrationStatus,
            JSON.stringify(nextMetadata),
            session.user_id,
          ],
        );

        const after = updateRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "carrier.update",
          entityType: "carriers",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "carrier.updated",
          entityType: "carrier",
          entityId: id,
          metaJson: {
            name: after.name,
            integration_status: after.integration_status,
          },
        });

        return after;
      },
    );

    if (!updated) {
      return NextResponse.json({ error: "Carrier not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: updated });
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
      return NextResponse.json({ error: "Invalid carrier id." }, { status: 400 });
    }

    const deleted = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM carriers
            WHERE id = $1
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE
          `,
          [id],
        );

        const before = beforeRes.rows[0];
        if (!before) {
          return null;
        }

        const deleteRes = await client.query(
          `
            UPDATE carriers
            SET
              deleted_at = now(),
              updated_by = $2
            WHERE id = $1
            RETURNING *
          `,
          [id, session.user_id],
        );

        const after = deleteRes.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "carrier.delete",
          entityType: "carriers",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "carrier.deleted",
          entityType: "carrier",
          entityId: id,
          metaJson: {
            name: before.name,
            deleted_at: after.deleted_at,
          },
        });

        return after;
      },
    );

    if (!deleted) {
      return NextResponse.json({ error: "Carrier not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: deleted });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
