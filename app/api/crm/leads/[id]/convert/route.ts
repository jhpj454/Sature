import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import { assertCrmUser, ForbiddenError, getLeadById } from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = { params: Promise<{ id: string }> };

const convertLeadSchema = z.object({
  account_name: z.string().trim().min(1, "Account name is required."),
  primary_contact_name: z.string().trim().min(1, "Primary contact name is required."),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  business_type: z.string().trim().nullable().optional(),
  account_manager_user_id: z.string().uuid().nullable().optional(),
  pipeline_stage_id: z.string().uuid("Invalid pipeline stage."),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      return jsonError(400, "Invalid lead id.");
    }

    const body = await request.json().catch(() => null);
    const parsed = convertLeadSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid payload.";
      return jsonError(400, issue);
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      // 1. Load and validate the lead
      const lead = await getLeadById(client, session.agency_id, id, true);
      if (!lead) {
        return { error: "Lead not found.", status: 404 as const };
      }
      if (lead.status === "converted") {
        return {
          error: "Lead has already been converted.",
          status: 422 as const,
        };
      }
      if (lead.status === "lost" || lead.status === "archived") {
        return {
          error: `Lead cannot be converted — current status is '${lead.status}'.`,
          status: 422 as const,
        };
      }

      // 2. Validate the pipeline_stage_id belongs to this agency
      const stageRes = await client.query(
        `
          SELECT id, stage_type, pipeline_id
          FROM crm_pipeline_stages
          WHERE id = $1
            AND agency_id = $2
          LIMIT 1
        `,
        [parsed.data.pipeline_stage_id, session.agency_id],
      );
      if ((stageRes.rowCount ?? 0) === 0) {
        return { error: "Pipeline stage not found.", status: 404 as const };
      }
      const stage = stageRes.rows[0];

      // 3. Insert the account
      const accountRes = await client.query(
        `
          INSERT INTO accounts (
            agency_id,
            account_type,
            account_name,
            status,
            assigned_producer_id,
            assigned_csr_id
          ) VALUES ($1, 'commercial', $2, 'active', $3, $4)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.account_name,
          session.user_id,
          parsed.data.account_manager_user_id ?? null,
        ],
      );
      const account = accountRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "account.create",
        entityType: "account",
        entityId: account.id,
        afterJson: account,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "account.created",
        entityType: "account",
        entityId: account.id,
        metaJson: {
          account_name: account.account_name,
          status: account.status,
          source: "crm_conversion",
        },
      });

      // 4. Split primary_contact_name into first/last name
      const nameParts = parsed.data.primary_contact_name.trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName = nameParts.slice(1).join(" ") || null;

      // 5. Insert the contact
      const contactRes = await client.query(
        `
          INSERT INTO contacts (
            agency_id,
            account_id,
            first_name,
            last_name,
            email,
            phone,
            source
          ) VALUES ($1, $2, $3, $4, $5, $6, 'crm_conversion')
          RETURNING *
        `,
        [
          session.agency_id,
          account.id,
          firstName,
          lastName,
          parsed.data.email ?? null,
          parsed.data.phone ?? null,
        ],
      );
      const contact = contactRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "contact.create",
        entityType: "contact",
        entityId: contact.id,
        afterJson: contact,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "contact.created",
        entityType: "contact",
        entityId: contact.id,
        metaJson: {
          account_id: account.id,
          source: "crm_conversion",
        },
      });

      // 6. Update the lead to converted
      const leadUpdateRes = await client.query(
        `
          UPDATE crm_leads
          SET
            status = 'converted',
            pipeline_stage_id = $3,
            updated_at = now()
          WHERE id = $1
            AND agency_id = $2
          RETURNING *
        `,
        [id, session.agency_id, parsed.data.pipeline_stage_id],
      );
      const updatedLead = leadUpdateRes.rows[0];

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.lead.convert",
        entityType: "crm_lead",
        entityId: lead.id,
        beforeJson: lead,
        afterJson: updatedLead,
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.lead.converted",
        entityType: "crm_lead",
        entityId: lead.id,
        metaJson: {
          account_id: account.id,
          contact_id: contact.id,
          pipeline_stage_id: parsed.data.pipeline_stage_id,
          pipeline_id: stage.pipeline_id,
          producer_user_id: session.user_id,
        },
      });

      return { data: { account_id: account.id } };
    });

    if ("error" in result) {
      return jsonError(result.status ?? 400, result.error ?? "Unable to convert lead.");
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/leads/[id]/convert failed", error);
    return jsonError(500, "Unable to convert lead.");
  }
}
