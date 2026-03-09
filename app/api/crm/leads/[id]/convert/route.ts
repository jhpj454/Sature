import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  assertCrmUser,
  ForbiddenError,
  getLeadById,
  mapDealStatusFromStageType,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

type RouteContext = { params: Promise<{ id: string }> };

const convertLeadSchema = z.object({
  title: z.string().trim().min(1, "Deal title is required."),
  estimated_revenue: z.coerce.number().min(0, "Estimated revenue must be 0 or greater."),
  pipeline_id: z.string().uuid("Invalid pipeline."),
  close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Close date must be YYYY-MM-DD.")
    .nullable()
    .optional(),
  notes: z.string().trim().nullable().optional(),
  create_account: z.boolean().optional().default(false),
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

    // withTenantClientFromRequest wraps in a transaction — the entire conversion
    // either fully commits or fully rolls back.
    const result = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      // 1. Load and validate the lead
      const lead = await getLeadById(client, session.agency_id, id, true);
      if (!lead) {
        return { error: "Lead not found.", status: 404 as const };
      }
      if (lead.status === "converted" || lead.status === "lost" || lead.status === "archived") {
        return {
          error: `Lead cannot be converted — current status is '${lead.status}'.`,
          status: 422 as const,
        };
      }

      // 2. Verify the pipeline belongs to this agency
      const pipelineRes = await client.query(
        `SELECT id FROM crm_pipelines WHERE id = $1 AND agency_id = $2 LIMIT 1`,
        [parsed.data.pipeline_id, session.agency_id],
      );
      if ((pipelineRes.rowCount ?? 0) === 0) {
        return { error: "Pipeline not found.", status: 404 as const };
      }

      // 3. Select the first stage of the pipeline ordered by sort_order
      const stageRes = await client.query(
        `
          SELECT id, stage_type
          FROM crm_pipeline_stages
          WHERE pipeline_id = $1
            AND agency_id = $2
          ORDER BY sort_order ASC
          LIMIT 1
        `,
        [parsed.data.pipeline_id, session.agency_id],
      );
      if ((stageRes.rowCount ?? 0) === 0) {
        return { error: "Pipeline has no stages.", status: 422 as const };
      }
      const firstStage = stageRes.rows[0];

      // 4. Optionally create an account
      let accountId: string | null = null;
      let createdAccount = null;
      if (parsed.data.create_account) {
        const accountName = lead.company_name?.trim() || "New Customer";
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
            ) VALUES ($1, 'commercial', $2, 'active', $3, NULL, NULL, $4)
            RETURNING *
          `,
          [
            session.agency_id,
            accountName,
            session.user_id,
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

      // 5. Create the deal
      const dealStatus = mapDealStatusFromStageType(firstStage.stage_type);
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
            expected_close_date,
            next_step,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `,
        [
          session.agency_id,
          parsed.data.pipeline_id,
          firstStage.id,
          accountId,
          lead.id,
          session.user_id,
          parsed.data.title,
          parsed.data.estimated_revenue,
          parsed.data.close_date ?? null,
          parsed.data.notes ?? null,
          dealStatus,
        ],
      );
      const deal = dealRes.rows[0];

      // 6. Update lead status to converted
      const leadUpdateRes = await client.query(
        `
          UPDATE crm_leads
          SET status = 'converted'
          WHERE id = $1
            AND agency_id = $2
          RETURNING *
        `,
        [id, session.agency_id],
      );
      const updatedLead = leadUpdateRes.rows[0];

      // 7. Audit and events
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
          producer_user_id: session.user_id,
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

      return { data: { deal_id: deal.id, account_id: accountId } };
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
