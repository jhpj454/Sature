import type { PoolClient } from "pg";

type AuditPayload = {
  agencyId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(client: PoolClient, payload: AuditPayload) {
  await client.query(
    `
      INSERT INTO audit_log (
        agency_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        before_json,
        after_json,
        request_id,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      payload.agencyId,
      payload.actorUserId,
      payload.action,
      payload.entityType,
      payload.entityId ?? null,
      payload.beforeJson ? JSON.stringify(payload.beforeJson) : null,
      payload.afterJson ? JSON.stringify(payload.afterJson) : null,
      payload.requestId ?? null,
      payload.ipAddress ?? null,
      payload.userAgent ?? null,
    ],
  );
}

export const logAudit = writeAuditLog;
