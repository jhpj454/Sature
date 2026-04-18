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
  getLeadById,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = { params: Promise<{ id: string }> };

const updateLeadSchema = z
  .object({
    first_name: z.string().trim().nullable().optional(),
    last_name: z.string().trim().nullable().optional(),
    company_name: z.string().trim().nullable().optional(),
    email: z.email().trim().nullable().optional(),
    phone: z.string().trim().nullable().optional(),
    source: z.string().trim().min(1).optional(),
    status: z.enum(CRM_LEAD_STATUSES).optional(),
    assigned_producer_id: z.string().uuid().nullable().optional(),
    assignment_status: z.enum(CRM_LEAD_ASSIGNMENT_STATUSES).optional(),
    pipeline_id: z.string().uuid().nullable().optional(),
    pipeline_stage_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().nullable().optional(),
    estimated_revenue: z.coerce.number().min(0).nullable().optional(),
    industry: z.string().trim().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required." });

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid lead id.");
    }

    const lead = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      return getLeadById(client, session.agency_id, id);
    });

    if (!lead) {
      return jsonError(404, "Lead not found.");
    }

    return NextResponse.json({ ok: true, data: lead });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("GET /api/crm/leads/[id] failed", error);
    return jsonError(500, "Unable to load lead.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid lead id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = updateLeadSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid payload.";
      return jsonError(400, issue);
    }

    const updated = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const before = await getLeadById(client, session.agency_id, id, true);
      if (!before) {
        return { error: "Lead not found." as const };
      }

      const assignedProducerId =
        parsed.data.assigned_producer_id !== undefined
          ? parsed.data.assigned_producer_id
          : before.assigned_producer_id;

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

      const nextAssignmentStatus =
        assignedProducerId === null
          ? "unassigned"
          : parsed.data.assignment_status ?? before.assignment_status ?? deriveLeadAssignmentStatus(assignedProducerId);

      const updateRes = await client.query(
        `
          UPDATE crm_leads
          SET
            first_name = $2,
            last_name = $3,
            company_name = $4,
            email = $5,
            phone = $6,
            source = $7,
            status = $8,
            assigned_producer_id = $9,
            assignment_status = $10,
            pipeline_id = $12,
            pipeline_stage_id = $13,
            notes = $14,
            estimated_revenue = $15,
            industry = $16,
            updated_at = now()
          WHERE id = $1
            AND agency_id = $11
          RETURNING *
        `,
        [
          id,
          parsed.data.first_name !== undefined ? normalizeOptionalText(parsed.data.first_name) : before.first_name,
          parsed.data.last_name !== undefined ? normalizeOptionalText(parsed.data.last_name) : before.last_name,
          parsed.data.company_name !== undefined ? normalizeOptionalText(parsed.data.company_name) : before.company_name,
          parsed.data.email !== undefined ? normalizeOptionalText(parsed.data.email) : before.email,
          parsed.data.phone !== undefined ? normalizeOptionalText(parsed.data.phone) : before.phone,
          parsed.data.source ?? before.source,
          parsed.data.status ?? before.status,
          assignedProducerId,
          nextAssignmentStatus,
          session.agency_id,
          parsed.data.pipeline_id !== undefined ? parsed.data.pipeline_id : before.pipeline_id ?? null,
          parsed.data.pipeline_stage_id !== undefined ? parsed.data.pipeline_stage_id : before.pipeline_stage_id ?? null,
          parsed.data.notes !== undefined ? normalizeOptionalText(parsed.data.notes) : before.notes ?? null,
          parsed.data.estimated_revenue !== undefined ? parsed.data.estimated_revenue : before.estimated_revenue ?? null,
          parsed.data.industry !== undefined ? normalizeOptionalText(parsed.data.industry) : before.industry ?? null,
        ],
      );

      const after = updateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.lead.update",
        entityType: "crm_lead",
        entityId: id,
        beforeJson: before,
        afterJson: after,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.lead.updated",
        entityType: "crm_lead",
        entityId: id,
        metaJson: {
          assignment_status: after.assignment_status,
          assigned_producer_id: after.assigned_producer_id,
          status: after.status,
        },
      });

      return { data: after };
    });

    if ("error" in updated) {
      const message = updated.error ?? "Unable to update lead.";
      return jsonError(message === "Lead not found." ? 404 : 400, message);
    }

    return NextResponse.json({ ok: true, data: updated.data });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("PATCH /api/crm/leads/[id] failed", error);
    return jsonError(500, "Unable to update lead.");
  }
}
