import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { emitEvent } from "@/src/server/events";
import { runRenewalAutomationJob } from "@/src/server/jobs/renewals-job.mjs";

const runRenewalsSchema = z.object({
  scope: z.enum(["all", "me"]).default("all"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = runRenewalsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const authResult = await withTenantClientFromRequest(request, async (client, session) => {
      if (session.role !== "admin") {
        return { error: "Forbidden" as const };
      }

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "job.renewals.started",
        entityType: "job",
        entityId: null,
        metaJson: {
          scope: parsed.data.scope,
        },
      });

      return {
        session,
      };
    });

    if ("error" in authResult) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const runResult = await runRenewalAutomationJob({
      initiatedByUserId: authResult.session.user_id,
      requestMeta: {
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      },
      onlyAgencyId: parsed.data.scope === "me" ? authResult.session.agency_id : null,
    });

    await withTenantClientFromRequest(request, async (client, session) => {
      if (session.role !== "admin") {
        return;
      }

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "job.renewals.completed",
        entityType: "job",
        entityId: null,
        metaJson: {
          scope: parsed.data.scope,
          totals: runResult.totals,
          ok: runResult.ok,
        },
      });
    });

    return NextResponse.json({ ok: true, data: runResult });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    throw error;
  }
}
