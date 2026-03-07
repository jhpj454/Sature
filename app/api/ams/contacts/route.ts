import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";

const CONTACT_TYPES = ["person", "business"] as const;
const CONTACT_STATUSES = ["active", "inactive"] as const;

const createContactSchema = z
  .object({
    contact_type: z.enum(CONTACT_TYPES).default("person"),
    first_name: z.string().trim().min(1).nullable().optional(),
    last_name: z.string().trim().min(1).nullable().optional(),
    business_name: z.string().trim().min(1).nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    address: z.record(z.string(), z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
    status: z.enum(CONTACT_STATUSES).default("active"),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    if (data.contact_type === "person") {
      const hasPersonName = Boolean(data.first_name || data.last_name);
      if (!hasPersonName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Person contacts require first_name or last_name.",
        });
      }
    }

    if (data.contact_type === "business" && !data.business_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Business contacts require business_name.",
      });
    }
  });

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  external_ref: z.string().trim().min(1).optional(),
  contact_type: z.enum(CONTACT_TYPES).optional(),
  account_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      external_ref: request.nextUrl.searchParams.get("external_ref") ?? undefined,
      contact_type: request.nextUrl.searchParams.get("contact_type") ?? undefined,
      account_id: request.nextUrl.searchParams.get("account_id") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json({ error: "Invalid query." }, { status: 400 });
    }

    const { q, external_ref, contact_type, account_id, page, page_size } = parsedQuery.data;
    const offset = (page - 1) * page_size;

    const data = await withTenantClientFromRequest(request, async (client, session) => {
      const rowsResult = await client.query(
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
          WHERE agency_id = $1
            AND deleted_at IS NULL
            AND ($2::text IS NULL OR contact_type = $2)
            AND (
              $3::text IS NULL
              OR external_ref ILIKE '%' || $3 || '%'
            )
            AND (
              $4::text IS NULL
              OR first_name ILIKE '%' || $4 || '%'
              OR last_name ILIKE '%' || $4 || '%'
              OR business_name ILIKE '%' || $4 || '%'
              OR email ILIKE '%' || $4 || '%'
              OR phone ILIKE '%' || $4 || '%'
            )
            AND (
              $5::uuid IS NULL
              OR EXISTS (
                SELECT 1
                FROM contact_roles cr
                JOIN policies p
                  ON cr.entity_type = 'policy'
                 AND p.id = cr.entity_id
                WHERE cr.contact_id = contacts.id
                  AND cr.deleted_at IS NULL
                  AND p.account_id = $5
              )
              OR EXISTS (
                SELECT 1
                FROM contact_roles cr
                JOIN service_cases sc
                  ON cr.entity_type = 'service_case'
                 AND sc.id = cr.entity_id
                WHERE cr.contact_id = contacts.id
                  AND cr.deleted_at IS NULL
                  AND sc.deleted_at IS NULL
                  AND sc.account_id = $5
              )
            )
          ORDER BY created_at DESC
          LIMIT $6 OFFSET $7
        `,
        [
          session.agency_id,
          contact_type ?? null,
          external_ref ?? null,
          q ?? null,
          account_id ?? null,
          page_size,
          offset,
        ],
      );

      const countResult = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM contacts
          WHERE agency_id = $1
            AND deleted_at IS NULL
            AND ($2::text IS NULL OR contact_type = $2)
            AND (
              $3::text IS NULL
              OR external_ref ILIKE '%' || $3 || '%'
            )
            AND (
              $4::text IS NULL
              OR first_name ILIKE '%' || $4 || '%'
              OR last_name ILIKE '%' || $4 || '%'
              OR business_name ILIKE '%' || $4 || '%'
              OR email ILIKE '%' || $4 || '%'
              OR phone ILIKE '%' || $4 || '%'
            )
            AND (
              $5::uuid IS NULL
              OR EXISTS (
                SELECT 1
                FROM contact_roles cr
                JOIN policies p
                  ON cr.entity_type = 'policy'
                 AND p.id = cr.entity_id
                WHERE cr.contact_id = contacts.id
                  AND cr.deleted_at IS NULL
                  AND p.account_id = $5
              )
              OR EXISTS (
                SELECT 1
                FROM contact_roles cr
                JOIN service_cases sc
                  ON cr.entity_type = 'service_case'
                 AND sc.id = cr.entity_id
                WHERE cr.contact_id = contacts.id
                  AND cr.deleted_at IS NULL
                  AND sc.deleted_at IS NULL
                  AND sc.account_id = $5
              )
            )
        `,
        [
          session.agency_id,
          contact_type ?? null,
          external_ref ?? null,
          q ?? null,
          account_id ?? null,
        ],
      );

      return {
        rows: rowsResult.rows,
        total: Number(countResult.rows[0]?.total ?? "0"),
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
    const parsed = createContactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const contact = await withTenantClientFromRequest(
      request,
      async (client, session) => {
        const result = await client.query(
          `
            INSERT INTO contacts (
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
              created_by,
              updated_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12, $13
            )
            RETURNING *
          `,
          [
            session.agency_id,
            parsed.data.contact_type,
            parsed.data.first_name ?? null,
            parsed.data.last_name ?? null,
            parsed.data.business_name ?? null,
            parsed.data.email ?? null,
            parsed.data.phone ?? null,
            JSON.stringify(parsed.data.address),
            parsed.data.tags,
            parsed.data.status,
            JSON.stringify(parsed.data.metadata),
            session.user_id,
            session.user_id,
          ],
        );

        const created = result.rows[0];

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "contact.create",
          entityType: "contacts",
          entityId: created.id,
          afterJson: created,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "contact.created",
          entityType: "contact",
          entityId: created.id,
          metaJson: {
            contact_type: created.contact_type,
            email: created.email,
          },
        });

        return created;
      },
    );

    return NextResponse.json({ ok: true, data: contact }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
