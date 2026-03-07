import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
    }

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            id,
            agency_id,
            entity_type,
            entity_id,
            file_name,
            mime_type,
            file_size,
            storage_key,
            checksum,
            tags,
            version,
            is_confidential,
            metadata,
            created_at,
            created_by,
            updated_at,
            updated_by,
            deleted_at
          FROM documents
          WHERE id = $1
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [id],
      );

      return result.rows[0] ?? null;
    });

    if (!data) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data });
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
      return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const beforeRes = await client.query(
          `
            SELECT *
            FROM documents
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
            UPDATE documents
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
          action: "document.delete",
          entityType: "documents",
          entityId: id,
          beforeJson: before,
          afterJson: after,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "document.deleted",
          entityType: "document",
          entityId: id,
          metaJson: {
            entity_type: before.entity_type,
            entity_id: before.entity_id,
            file_name: before.file_name,
          },
        });

        return after;
      },
    );

    if (!result) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
