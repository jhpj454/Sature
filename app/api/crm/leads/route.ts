import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  CRM_LEAD_ASSIGNMENT_STATUSES,
  CRM_LEAD_STATUSES,
  deriveLeadAssignmentStatus,
  ForbiddenError,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const createLeadSchema = z
  .object({
    first_name: z.string().trim().nullable().optional(),
    last_name: z.string().trim().nullable().optional(),
    company_name: z.string().trim().nullable().optional(),
    email: z.email().trim().nullable().optional(),
    phone: z.string().trim().nullable().optional(),
    source: z.string().trim().min(1).default("manual"),
    status: z.enum(CRM_LEAD_STATUSES).default("new"),
    assigned_producer_id: z.string().uuid().nullable().optional(),
    assignment_status: z.enum(CRM_LEAD_ASSIGNMENT_STATUSES).optional(),
    lead_list_id: z.string().uuid().nullable().optional(),
    pipeline_id: z.string().uuid().nullable().optional(),
    pipeline_stage_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    estimated_revenue: z.coerce.number().min(0).nullable().optional(),
    industry: z.string().trim().nullable().optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.first_name || value.last_name || value.company_name || value.email || value.phone,
      ),
    { message: "Lead requires at least one identifying field." },
  );

const listLeadsQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  status: z.enum(CRM_LEAD_STATUSES).optional(),
  assignment_status: z.enum(CRM_LEAD_ASSIGNMENT_STATUSES).optional(),
  assigned_producer_id: z.string().uuid().optional(),
  view: z.enum(["all", "mine", "unassigned"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: NextRequest) {
  try {
    const parsedQuery = listLeadsQuerySchema.safeParse({
      q: request.nextUrl.searchParams.get("q") ?? undefined,
      source: request.nextUrl.searchParams.get("source") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      assignment_status: request.nextUrl.searchParams.get("assignment_status") ?? undefined,
      assigned_producer_id:
        request.nextUrl.searchParams.get("assigned_producer_id") ?? undefined,
      view: request.nextUrl.searchParams.get("view") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(400, "Invalid query.");
    }

    const { q, source, status, assignment_status, assigned_producer_id, view, page, page_size } =
      parsedQuery.data;
    const offset = (page - 1) * page_size;

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const effectiveAssignedProducerId =
        view === "mine" ? session.user_id : assigned_producer_id ?? null;
      const unassignedOnly = view === "unassigned";

      const rowsRes = await client.query(
        `
          SELECT
            l.*, 
            producer.display_name AS assigned_producer_display_name,
            ll.name AS lead_list_name
          FROM crm_leads l
          LEFT JOIN users producer
            ON producer.id = l.assigned_producer_id
           AND producer.agency_id = l.agency_id
          LEFT JOIN crm_lead_lists ll
            ON ll.id = l.lead_list_id
           AND ll.agency_id = l.agency_id
          WHERE l.agency_id = $1
            AND ($2::text IS NULL OR l.source = $2)
            AND ($3::text IS NULL OR l.status = $3)
            AND ($4::text IS NULL OR l.assignment_status = $4)
            AND ($5::uuid IS NULL OR l.assigned_producer_id = $5)
            AND ($6::boolean = false OR l.assigned_producer_id IS NULL)
            AND (
              $7::text IS NULL
              OR COALESCE(l.first_name, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.last_name, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.company_name, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.email, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.phone, '') ILIKE '%' || $7 || '%'
            )
          ORDER BY l.updated_at DESC, l.created_at DESC
          LIMIT $8 OFFSET $9
        `,
        [
          session.agency_id,
          source ?? null,
          status ?? null,
          assignment_status ?? null,
          effectiveAssignedProducerId,
          unassignedOnly,
          q ?? null,
          page_size,
          offset,
        ],
      );

      const countRes = await client.query<{ total: string }>(
        `
          SELECT COUNT(*)::text AS total
          FROM crm_leads l
          WHERE l.agency_id = $1
            AND ($2::text IS NULL OR l.source = $2)
            AND ($3::text IS NULL OR l.status = $3)
            AND ($4::text IS NULL OR l.assignment_status = $4)
            AND ($5::uuid IS NULL OR l.assigned_producer_id = $5)
            AND ($6::boolean = false OR l.assigned_producer_id IS NULL)
            AND (
              $7::text IS NULL
              OR COALESCE(l.first_name, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.last_name, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.company_name, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.email, '') ILIKE '%' || $7 || '%'
              OR COALESCE(l.phone, '') ILIKE '%' || $7 || '%'
            )
        `,
        [
          session.agency_id,
          source ?? null,
          status ?? null,
          assignment_status ?? null,
          effectiveAssignedProducerId,
          unassignedOnly,
          q ?? null,
        ],
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? "0"),
      };
    });

    return NextResponse.json({
      ok: true,
      data: result.rows,
      pagination: { page, page_size, total: result.total },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/leads failed", error);
    return jsonError(500, "Unable to load leads.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid payload.";
      return jsonError(400, issue);
    }

    const created = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      const assignedProducerId = parsed.data.assigned_producer_id ?? null;
      if (assignedProducerId) {
        const producerExists = await activeAgencyUserExists(
          client,
          assignedProducerId,
          session.agency_id,
          ["producer", "admin"],
        );
        if (!producerExists) {
          return { error: "Assigned producer not found." as const };
        }
      }

      if (parsed.data.lead_list_id) {
        const listRes = await client.query(
          `
            SELECT 1
            FROM crm_lead_lists
            WHERE id = $1
              AND agency_id = $2
            LIMIT 1
          `,
          [parsed.data.lead_list_id, session.agency_id],
        );
        if ((listRes.rowCount ?? 0) === 0) {
          return { error: "Lead list not found." as const };
        }
      }

      const assignmentStatus =
        assignedProducerId === null
          ? "unassigned"
          : parsed.data.assignment_status ?? deriveLeadAssignmentStatus(assignedProducerId);

      const insertRes = await client.query(
        `
          INSERT INTO crm_leads (
            agency_id,
            first_name,
            last_name,
            company_name,
            email,
            phone,
            source,
            status,
            assigned_producer_id,
            assignment_status,
            lead_list_id,
            pipeline_id,
            pipeline_stage_id,
            notes,
            estimated_revenue,
            industry
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *
        `,
        [
          session.agency_id,
          normalizeOptionalText(parsed.data.first_name),
          normalizeOptionalText(parsed.data.last_name),
          normalizeOptionalText(parsed.data.company_name),
          normalizeOptionalText(parsed.data.email),
          normalizeOptionalText(parsed.data.phone),
          parsed.data.source,
          parsed.data.status,
          assignedProducerId,
          assignmentStatus,
          parsed.data.lead_list_id ?? null,
          parsed.data.pipeline_id ?? null,
          parsed.data.pipeline_stage_id ?? null,
          normalizeOptionalText(parsed.data.notes) ?? null,
          parsed.data.estimated_revenue ?? null,
          normalizeOptionalText(parsed.data.industry) ?? null,
        ],
      );

      const lead = insertRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.lead.create",
        entityType: "crm_lead",
        entityId: lead.id,
        afterJson: lead,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.lead.created",
        entityType: "crm_lead",
        entityId: lead.id,
        metaJson: {
          assignment_status: lead.assignment_status,
          assigned_producer_id: lead.assigned_producer_id,
          source: lead.source,
          status: lead.status,
        },
      });

      return { data: lead };
    });

    if ("error" in created) {
      const message = created.error ?? "Unable to create lead.";
      const status = message === "Lead list not found." ? 404 : 400;
      return jsonError(status, message);
    }

    return NextResponse.json({ ok: true, data: created.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/leads failed", error);
    return jsonError(500, "Unable to create lead.");
  }
}
