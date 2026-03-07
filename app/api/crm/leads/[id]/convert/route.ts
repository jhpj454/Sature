import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  deriveLeadAssignmentStatus,
  ForbiddenError,
  getLeadById,
  getStageById,
  getVisiblePipeline,
  mapDealStatusFromStageType,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = { params: Promise<{ id: string }> };

const convertLeadSchema = z.object({
  pipeline_id: z.string().uuid(),
  pipeline_stage_id: z.string().uuid(),
  create_account: z.boolean().default(false),
  account_id: z.string().uuid().nullable().optional(),
  account_type: z.enum(["commercial", "personal"]).optional(),
  account_name: z.string().trim().min(1).optional(),
  deal_name: z.string().trim().min(1).optional(),
  estimated_revenue: z.coerce.number().min(0).default(0),
  estimated_premium: z.coerce.number().min(0).nullable().optional(),
  estimated_commission_pct: z.coerce.number().min(0).max(1).nullable().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  next_step: z.string().trim().nullable().optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function buildAccountName(lead: Record<string, string | null>) {
  if (lead.company_name) return lead.company_name;
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim();
  return fullName || lead.email || lead.phone || "Converted Lead";
}

function buildDealName(lead: Record<string, string | null>, accountName?: string) {
  const base = accountName || buildAccountName(lead);
  return `${base} Opportunity`;
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

    const converted = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);
      const lead = await getLeadById(client, session.agency_id, id, true);
      if (!lead) {
        return { error: "Lead not found." as const };
      }

      const pipeline = await getVisiblePipeline(client, session.agency_id, parsed.data.pipeline_id, session);
      if (!pipeline) {
        return { error: "Pipeline not found." as const };
      }

      const stage = await getStageById(client, session.agency_id, parsed.data.pipeline_stage_id);
      if (!stage || stage.pipeline_id !== parsed.data.pipeline_id) {
        return { error: "Pipeline stage not found." as const };
      }

      const producerUserId = lead.assigned_producer_id ?? session.user_id;
      const producerExists = await activeAgencyUserExists(
        client,
        producerUserId,
        session.agency_id,
        ["producer", "admin"],
      );
      if (!producerExists) {
        return { error: "Producer not found." as const };
      }

      let accountId = parsed.data.account_id ?? null;
      let createdAccount = null;
      if (accountId) {
        const accountRes = await client.query(
          `
            SELECT *
            FROM accounts
            WHERE id = $1
              AND agency_id = $2
            LIMIT 1
          `,
          [accountId, session.agency_id],
        );
        if ((accountRes.rowCount ?? 0) === 0) {
          return { error: "Customer not found." as const };
        }
      } else if (parsed.data.create_account) {
        const accountName = parsed.data.account_name?.trim() || buildAccountName(lead);
        const accountType = parsed.data.account_type ?? (lead.company_name ? "commercial" : "personal");
        const accountRes = await client.query(
          `
            INSERT INTO accounts (
              agency_id,
              account_type,
              account_name,
              status,
              assigned_producer_id,
              assigned_csr_id,
              industry_segment,
              notes
            ) VALUES ($1, $2, $3, 'prospect', $4, NULL, NULL, $5)
            RETURNING *
          `,
          [
            session.agency_id,
            accountType,
            accountName,
            producerUserId,
            `Created from lead ${lead.id}`,
          ],
        );
        createdAccount = accountRes.rows[0];
        accountId = createdAccount.id;

        await logAudit(client, {
          agencyId: session.agency_id,
          actorUserId: session.user_id,
          action: "account.create",
          entityType: "account",
          entityId: createdAccount.id,
          afterJson: createdAccount,
          requestId: request.headers.get("x-request-id"),
          ipAddress: request.headers.get("x-forwarded-for"),
          userAgent: request.headers.get("user-agent"),
        });

        await emitEvent(client, {
          agencyId: session.agency_id,
          eventType: "account.created",
          entityType: "account",
          entityId: createdAccount.id,
          metaJson: {
            account_name: createdAccount.account_name,
            status: createdAccount.status,
            source: "lead_conversion",
          },
        });
      }

      const dealName = parsed.data.deal_name?.trim() || buildDealName(lead, createdAccount?.account_name);
      const dealStatus = mapDealStatusFromStageType(stage.stage_type);
      const dealRes = await client.query(
        `
          INSERT INTO crm_deals (
            agency_id,
            pipeline_id,
            pipeline_stage_id,
            account_id,
            lead_id,
            producer_user_id,
            name,
            estimated_revenue,
            estimated_premium,
            estimated_commission_pct,
            expected_close_date,
            next_step,
            next_step_due_at,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, $13)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.pipeline_id,
          parsed.data.pipeline_stage_id,
          accountId,
          lead.id,
          producerUserId,
          dealName,
          parsed.data.estimated_revenue,
          parsed.data.estimated_premium ?? null,
          parsed.data.estimated_commission_pct ?? null,
          parsed.data.expected_close_date ?? null,
          parsed.data.next_step ?? null,
          dealStatus,
        ],
      );
      const deal = dealRes.rows[0];

      const leadUpdateRes = await client.query(
        `
          UPDATE crm_leads
          SET
            status = 'converted',
            assigned_producer_id = $2,
            assignment_status = $3
          WHERE id = $1
            AND agency_id = $4
          RETURNING *
        `,
        [id, producerUserId, deriveLeadAssignmentStatus(producerUserId), session.agency_id],
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

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.deal.create",
        entityType: "crm_deal",
        entityId: deal.id,
        afterJson: deal,
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
          deal_id: deal.id,
          account_id: accountId,
          producer_user_id: producerUserId,
        },
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.deal.created",
        entityType: "crm_deal",
        entityId: deal.id,
        metaJson: {
          pipeline_id: deal.pipeline_id,
          pipeline_stage_id: deal.pipeline_stage_id,
          estimated_revenue: deal.estimated_revenue,
          lead_id: lead.id,
        },
      });

      return { data: { lead: updatedLead, deal, account: createdAccount } };
    });

    if ("error" in converted) {
      const statusMap: Record<string, number> = {
        "Lead not found.": 404,
        "Pipeline not found.": 404,
        "Pipeline stage not found.": 404,
        "Producer not found.": 400,
        "Customer not found.": 404,
      };
      const message = converted.error ?? "Unable to convert lead.";
      return jsonError(statusMap[message] ?? 400, message);
    }

    return NextResponse.json({ ok: true, data: converted.data }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/leads/[id]/convert failed", error);
    return jsonError(500, "Unable to convert lead.");
  }
}
