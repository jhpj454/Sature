import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { attachDocument } from "@/src/server/entity-writes";

const ENTITY_TYPES = [
  "policy",
  "service_case",
  "contact",
  "policy_transaction",
  "carrier",
] as const;

const querySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
});

const createSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  file_name: z.string().min(1),
  mime_type: z.string().nullable().optional(),
  file_size: z.coerce.number().int().nonnegative().nullable().optional(),
  storage_key: z.string().min(1),
  checksum: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  version: z.coerce.number().int().min(1).default(1),
  is_confidential: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = querySchema.safeParse({
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
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      const attached = await attachDocument(
        {
          client,
          session,
          meta: {
            requestId: request.headers.get("x-request-id"),
            ipAddress: request.headers.get("x-forwarded-for"),
            userAgent: request.headers.get("user-agent"),
          },
        },
        {
          entity_type: parsed.data.entity_type,
          entity_id: parsed.data.entity_id,
          file_name: parsed.data.file_name,
          mime_type: parsed.data.mime_type ?? null,
          file_size: parsed.data.file_size ?? null,
          storage_key: parsed.data.storage_key,
          checksum: parsed.data.checksum ?? null,
          tags: parsed.data.tags,
          version: parsed.data.version,
          is_confidential: parsed.data.is_confidential,
          metadata: parsed.data.metadata,
          createDocumentAddedActivity: true,
        },
      );

      return {
        document_id: attached.document.id,
        document: attached.document,
        activity: attached.activity,
      };
    });

    return NextResponse.json({ ok: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
