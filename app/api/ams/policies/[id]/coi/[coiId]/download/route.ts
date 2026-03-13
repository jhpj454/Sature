import { NextRequest, NextResponse } from "next/server";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";
import { generateCoiPdf } from "@/src/server/coi-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; coiId: string }> },
) {
  try {
    const { id: policyId, coiId } = await params;

    const pdfData = await withTenantClientFromRequest(request, async (client, session) => {
      // Load COI request + associated data in one shot
      const result = await client.query(
        `
          SELECT
            cr.id AS coi_request_id,
            cr.created_at AS issued_at,
            p.policy_number,
            p.lob,
            p.effective_date,
            p.expiration_date,
            p.premium_amount,
            a.account_name,
            c.name AS carrier_name,
            ag.name AS agency_name,
            ch.holder_name,
            ch.holder_address
          FROM coi_requests cr
          JOIN policies p ON p.id = cr.policy_id
          JOIN accounts a ON a.id = p.account_id
          JOIN agencies ag ON ag.id = cr.agency_id
          LEFT JOIN carriers c ON c.id = p.carrier_id
          LEFT JOIN certificate_holders ch ON ch.id = cr.holder_id
          WHERE cr.id = $1
            AND cr.policy_id = $2
            AND cr.agency_id = current_setting('app.current_agency_id', true)::uuid
          LIMIT 1
        `,
        [coiId, policyId],
      );

      if (result.rows.length === 0) {
        return { error: "NOT_FOUND" as const };
      }

      const row = result.rows[0];

      const [limitsRes, coveragesRes] = await Promise.all([
        client.query(
          `SELECT coverage_type, limit_type, limit_amount FROM policy_limits
           WHERE policy_id = $1
             AND agency_id = current_setting('app.current_agency_id', true)::uuid
             AND deleted_at IS NULL
           ORDER BY coverage_type, limit_type`,
          [policyId],
        ),
        client.query(
          `SELECT coverage_name, description FROM policy_coverages
           WHERE policy_id = $1
             AND agency_id = current_setting('app.current_agency_id', true)::uuid
             AND deleted_at IS NULL
           ORDER BY coverage_name`,
          [policyId],
        ),
      ]);

      return {
        coiRequestId: row.coi_request_id as string,
        issuedDate: row.issued_at as string,
        producerName: row.agency_name as string,
        insuredName: row.account_name as string,
        policyNumber: row.policy_number as string,
        lob: row.lob as string,
        carrierName: (row.carrier_name as string | null) ?? "—",
        effectiveDate: row.effective_date as string,
        expirationDate: row.expiration_date as string,
        premiumAmount: row.premium_amount as number | null,
        holderName: (row.holder_name as string | null) ?? "—",
        holderAddress: row.holder_address as string | null,
        limits: limitsRes.rows as Array<{ coverage_type: string; limit_type: string; limit_amount: number }>,
        coverages: coveragesRes.rows as Array<{ coverage_name: string; description: string | null }>,
      };
    });

    if ("error" in pdfData) {
      return NextResponse.json({ error: "Certificate not found." }, { status: 404 });
    }

    const pdfBytes = await generateCoiPdf(pdfData);

    return new NextResponse(pdfBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="COI-${pdfData.policyNumber}-${coiId.slice(0, 8)}.pdf"`,
        "Content-Length": String(pdfBytes.length),
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
