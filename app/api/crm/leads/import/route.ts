import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/src/server/audit";
import {
  activeAgencyUserExists,
  assertCrmUser,
  deriveLeadAssignmentStatus,
  ForbiddenError,
} from "@/src/server/crm";
import { emitEvent } from "@/src/server/events";
import { UnauthorizedError, withTenantClientFromRequest } from "@/src/server/tenant";

const importSchema = z.object({
  assignment_mode: z.enum(["unassigned", "single", "round_robin"]).default("unassigned"),
  producer_user_id: z.string().uuid().optional(),
  producer_user_ids: z.array(z.string().uuid()).default([]),
  source: z.string().trim().min(1).default("import"),
  list_name: z.string().trim().min(1).optional(),
});

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function parseProducerIds(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return raw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  const aliases: Record<string, string[]> = {
    first_name: ["first_name", "firstname", "first"],
    last_name: ["last_name", "lastname", "last", "surname"],
    company_name: ["company", "company_name", "business", "business_name"],
    email: ["email", "email_address"],
    phone: ["phone", "phone_number", "mobile"],
  };

  const columnIndex = Object.fromEntries(
    Object.entries(aliases).map(([target, keys]) => [
      target,
      headers.findIndex((header) => keys.includes(header)),
    ]),
  ) as Record<keyof typeof aliases, number>;

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {
      first_name: columnIndex.first_name >= 0 ? values[columnIndex.first_name] ?? "" : "",
      last_name: columnIndex.last_name >= 0 ? values[columnIndex.last_name] ?? "" : "",
      company_name: columnIndex.company_name >= 0 ? values[columnIndex.company_name] ?? "" : "",
      email: columnIndex.email >= 0 ? values[columnIndex.email] ?? "" : "",
      phone: columnIndex.phone >= 0 ? values[columnIndex.phone] ?? "" : "",
    };

    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value.trim() || null]),
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "CSV file is required.");
    }

    const parsed = importSchema.safeParse({
      assignment_mode: formData.get("assignment_mode") ?? undefined,
      producer_user_id: formData.get("producer_user_id") ?? undefined,
      producer_user_ids: parseProducerIds(formData.get("producer_user_ids")),
      source: formData.get("source") ?? undefined,
      list_name: formData.get("list_name") ?? undefined,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0]?.message ?? "Invalid import payload.";
      return jsonError(400, issue);
    }

    const csvText = await file.text();
    const rows = parseCsv(csvText).filter(
      (row) => row.first_name || row.last_name || row.company_name || row.email || row.phone,
    );
    if (rows.length === 0) {
      return jsonError(400, "No valid lead rows found in CSV.");
    }

    const imported = await withTenantClientFromRequest(request, async (client, session) => {
      assertCrmUser(session);

      if (parsed.data.assignment_mode === "single") {
        if (!parsed.data.producer_user_id) {
          return { error: "Select a producer for single assignment." as const };
        }
        const exists = await activeAgencyUserExists(
          client,
          parsed.data.producer_user_id,
          session.agency_id,
          ["producer", "admin"],
        );
        if (!exists) return { error: "Assigned producer not found." as const };
      }

      if (parsed.data.assignment_mode === "round_robin") {
        if (parsed.data.producer_user_ids.length === 0) {
          return { error: "Select at least one producer for round robin assignment." as const };
        }
        for (const producerId of parsed.data.producer_user_ids) {
          const exists = await activeAgencyUserExists(
            client,
            producerId,
            session.agency_id,
            ["producer", "admin"],
          );
          if (!exists) return { error: "Assigned producer not found." as const };
        }
      }

      const fileBaseName = file.name.replace(/\.csv$/i, "");
      const fallbackListName =
        parsed.data.list_name || fileBaseName || `Lead import ${new Date().toISOString().slice(0, 10)}`;

      const leadListRes = await client.query(
        `
          INSERT INTO crm_lead_lists (
            agency_id,
            name,
            source,
            uploaded_by_user_id,
            row_count
          ) VALUES ($1, $2, 'csv_import', $3, $4)
          RETURNING *
        `,
        [
          session.agency_id,
          fallbackListName,
          session.user_id,
          rows.length,
        ],
      );
      const leadList = leadListRes.rows[0];

      const createdRows = [];
      for (const [index, row] of rows.entries()) {
        let assignedProducerId: string | null = null;
        if (parsed.data.assignment_mode === "single") {
          assignedProducerId = parsed.data.producer_user_id ?? null;
        } else if (parsed.data.assignment_mode === "round_robin") {
          assignedProducerId = parsed.data.producer_user_ids[index % parsed.data.producer_user_ids.length] ?? null;
        }

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
              lead_list_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'new', $8, $9, $10)
            RETURNING *
          `,
          [
            session.agency_id,
            row.first_name,
            row.last_name,
            row.company_name,
            row.email,
            row.phone,
            parsed.data.source,
            assignedProducerId,
            assignedProducerId ? deriveLeadAssignmentStatus(assignedProducerId) : "unassigned",
            leadList.id,
          ],
        );
        createdRows.push(insertRes.rows[0]);
      }

      await logAudit(client, {
        agencyId: session.agency_id,
        actorUserId: session.user_id,
        action: "crm.lead.import",
        entityType: "crm_lead_list",
        entityId: leadList.id,
        afterJson: { lead_list: leadList, created_count: createdRows.length },
        requestId: request.headers.get("x-request-id"),
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      });

      await emitEvent(client, {
        agencyId: session.agency_id,
        eventType: "crm.leads.imported",
        entityType: "crm_lead_list",
        entityId: leadList.id,
        metaJson: {
          created_count: createdRows.length,
          assignment_mode: parsed.data.assignment_mode,
          source: parsed.data.source,
        },
      });

      return { data: { lead_list: leadList, leads: createdRows } };
    });

    if ("error" in imported) {
      return jsonError(400, imported.error ?? "Unable to import leads.");
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          lead_list: imported.data.lead_list,
          created_count: imported.data.leads.length,
          leads: imported.data.leads,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return jsonError(401, "Unauthorized");
    if (error instanceof ForbiddenError) return jsonError(403, "Forbidden");
    console.error("POST /api/crm/leads/import failed", error);
    return jsonError(500, "Unable to import leads.");
  }
}
