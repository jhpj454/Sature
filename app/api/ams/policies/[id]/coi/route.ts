import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withTenantClientFromRequest, UnauthorizedError } from "@/src/server/tenant";

const createSchema = z.object({
  holder_name: z.string().min(1).max(200),
  holder_address: z.string().max(300).nullable().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: policyId } = await params;

    const data = await withTenantClientFromRequest(request, async (client) => {
      const result = await client.query(
        `
          SELECT
            cr.id,
            cr.status,
            cr.created_at AS issued_at,
            cr.requested_by_user_id AS issued_by_user_id,
            u.display_name AS issued_by_name,
            ch.holder_name,
            ch.holder_address
          FROM coi_requests cr
          LEFT JOIN certificate_holders ch ON ch.id = cr.holder_id
          LEFT JOIN users u ON u.id = cr.requested_by_user_id
          WHERE cr.agency_id = current_setting('app.current_agency_id', true)::uuid
            AND cr.policy_id = $1
            AND cr.status = 'issued'
          ORDER BY cr.created_at DESC
        `,
        [policyId],
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: policyId } = await params;
    const body = await request.json().catch(() => null);
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    }

    const result = await withTenantClientFromRequest(request, async (client, session) => {
      // Verify the policy belongs to this agency
      const policyRes = await client.query(
        `
          SELECT
            p.id,
            p.policy_number,
            p.lob,
            p.effective_date,
            p.expiration_date,
            p.status,
            p.account_id,
            p.carrier_id,
            p.premium_amount,
            a.account_name,
            c.name AS carrier_name,
            ag.name AS agency_name
          FROM policies p
          LEFT JOIN accounts a ON a.id = p.account_id
          LEFT JOIN carriers c ON c.id = p.carrier_id
          LEFT JOIN agencies ag ON ag.id = p.agency_id
          WHERE p.id = $1
            AND p.agency_id = current_setting('app.current_agency_id', true)::uuid
          LIMIT 1
        `,
        [policyId],
      );

      if (policyRes.rows.length === 0) {
        return { error: "NOT_FOUND" as const };
      }

      const policy = policyRes.rows[0] as {
        id: string;
        policy_number: string;
        lob: string;
        effective_date: string;
        expiration_date: string;
        status: string;
        account_id: string;
        carrier_id: string | null;
        premium_amount: number | null;
        account_name: string;
        carrier_name: string | null;
        agency_name: string;
      };

      // Fetch limits and coverages
      const [limitsRes, coveragesRes] = await Promise.all([
        client.query(
          `SELECT applies_to, limit_type, limit_amount FROM policy_limits
           WHERE policy_id = $1
             AND agency_id = current_setting('app.current_agency_id', true)::uuid
           ORDER BY applies_to, limit_type`,
          [policyId],
        ),
        client.query(
          `SELECT coverage_type, description FROM policy_coverages
           WHERE policy_id = $1
             AND agency_id = current_setting('app.current_agency_id', true)::uuid
           ORDER BY coverage_type`,
          [policyId],
        ),
      ]);

      // Create or reuse certificate holder
      const holderName = parsed.data.holder_name;
      const holderAddress = parsed.data.holder_address ?? null;

      const holderRes = await client.query(
        `
          INSERT INTO certificate_holders (agency_id, account_id, holder_name, holder_address)
          VALUES (current_setting('app.current_agency_id', true)::uuid, $1, $2, $3)
          RETURNING id
        `,
        [policy.account_id, holderName, holderAddress],
      );

      const holderId = holderRes.rows[0].id as string;

      // Record the COI issuance
      const coiRes = await client.query(
        `
          INSERT INTO coi_requests (
            agency_id,
            account_id,
            policy_id,
            holder_id,
            status,
            requested_by_user_id
          )
          VALUES (
            current_setting('app.current_agency_id', true)::uuid,
            $1, $2, $3, 'issued', $4
          )
          RETURNING id, created_at
        `,
        [policy.account_id, policyId, holderId, session.user_id],
      );

      const coiRequest = coiRes.rows[0] as { id: string; created_at: string };

      return {
        coiRequestId: coiRequest.id,
        issuedAt: coiRequest.created_at,
        policy,
        limits: limitsRes.rows as Array<{ applies_to: string | null; limit_type: string; limit_amount: number }>,
        coverages: coveragesRes.rows as Array<{ coverage_type: string; description: string | null }>,
        holderName,
        holderAddress,
      };
    });

    if ("error" in result) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      data: {
        coi_request_id: result.coiRequestId,
        issued_at: result.issuedAt,
        policy_number: result.policy.policy_number,
        holder_name: result.holderName,
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
