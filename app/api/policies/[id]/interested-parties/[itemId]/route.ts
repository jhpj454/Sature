import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const PARTY_TYPES = [
  "named_insured",
  "additional_insured",
  "loss_payee",
  "mortgagee",
  "lessor",
  "certificate_holder",
] as const;

const updateSchema = z.object({
  party_type: z.enum(PARTY_TYPES),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
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
  account_id: z.string().uuid().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id, itemId } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(itemId).success) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT * FROM policy_interested_parties
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
          LIMIT 1 FOR UPDATE
        `,
        [itemId, id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Record not found." as const };
      }

      const updateRes = await client.query(
        `
          UPDATE policy_interested_parties
          SET
            party_type = $4,
            name = $5,
            address = $6,
            description = $7,
            effective_date = $8,
            expiration_date = $9,
            account_id = $10
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
          RETURNING *
        `,
        [
          itemId,
          id,
          session.agency_id,
          parsed.data.party_type,
          parsed.data.name,
          parsed.data.address ?? null,
          parsed.data.description ?? null,
          parsed.data.effective_date ?? null,
          parsed.data.expiration_date ?? null,
          parsed.data.account_id ?? null,
        ],
      );

      const row = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_interested_party.update",
        entityType: "policy_interested_parties",
        entityId: itemId,
        beforeJson: before,
        afterJson: row,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_interested_party.updated",
        entityType: "policy_interested_party",
        entityId: itemId,
        metaJson: { policy_id: id },
      });

      return { data: row };
    });

    if ("error" in updated) {
      return NextResponse.json({ error: updated.error }, { status: 404 });
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
    const { id, itemId } = await context.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(itemId).success) {
      return NextResponse.json({ error: "Invalid id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const beforeRes = await client.query(
        `
          SELECT * FROM policy_interested_parties
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
          LIMIT 1
        `,
        [itemId, id, session.agency_id],
      );

      const before = beforeRes.rows[0];
      if (!before) {
        return { error: "Record not found." as const };
      }

      await client.query(
        `
          DELETE FROM policy_interested_parties
          WHERE id = $1 AND policy_id = $2 AND agency_id = $3
        `,
        [itemId, id, session.agency_id],
      );

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "policy_interested_party.delete",
        entityType: "policy_interested_parties",
        entityId: itemId,
        beforeJson: before,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "policy_interested_party.deleted",
        entityType: "policy_interested_party",
        entityId: itemId,
        metaJson: { policy_id: id },
      });

      return { ok: true };
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
