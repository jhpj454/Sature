import type { PoolClient } from "pg";
import { logAudit } from "@/src/server/audit";
import { emitEvent } from "@/src/server/events";
import type { SessionContext } from "@/src/server/tenant";

type RequestMeta = {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type TenantTx = {
  client: PoolClient;
  session: Pick<SessionContext, "agency_id" | "user_id">;
  meta?: RequestMeta;
};

type CreateActivityInput = {
  entity_type:
    | "policy"
    | "service_case"
    | "document"
    | "contact"
    | "policy_transaction"
    | "carrier";
  entity_id: string;
  activity_type:
    | "note"
    | "email"
    | "call"
    | "task"
    | "system"
    | "status_change"
    | "document_added";
  occurred_at?: string | Date | null;
  summary: string;
  details?: Record<string, unknown>;
};

type AttachDocumentInput = {
  entity_type: "policy" | "service_case" | "contact" | "policy_transaction" | "carrier";
  entity_id: string;
  file_name: string;
  mime_type?: string | null;
  file_size?: number | null;
  storage_key: string;
  checksum?: string | null;
  tags?: string[];
  version?: number;
  is_confidential?: boolean;
  metadata?: Record<string, unknown>;
  createDocumentAddedActivity?: boolean;
};

function toIsoOrNow(value?: string | Date | null) {
  if (!value) {
    return new Date().toISOString();
  }
  return value instanceof Date ? value.toISOString() : value;
}

export async function createActivity(tx: TenantTx, input: CreateActivityInput) {
  const result = await tx.client.query(
    `
      INSERT INTO activities (
        agency_id,
        entity_type,
        entity_id,
        activity_type,
        occurred_at,
        summary,
        details,
        created_by,
        updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
    [
      tx.session.agency_id,
      input.entity_type,
      input.entity_id,
      input.activity_type,
      toIsoOrNow(input.occurred_at),
      input.summary,
      JSON.stringify(input.details ?? {}),
      tx.session.user_id,
      tx.session.user_id,
    ],
  );

  const created = result.rows[0];

  await logAudit(tx.client, {
    agencyId: tx.session.agency_id,
    actorUserId: tx.session.user_id,
    action: "activity.create",
    entityType: "activities",
    entityId: created.id,
    afterJson: created,
    requestId: tx.meta?.requestId ?? null,
    ipAddress: tx.meta?.ipAddress ?? null,
    userAgent: tx.meta?.userAgent ?? null,
  });

  await emitEvent(tx.client, {
    agencyId: tx.session.agency_id,
    eventType: "activity.created",
    entityType: "activity",
    entityId: created.id,
    metaJson: {
      entity_type: created.entity_type,
      entity_id: created.entity_id,
      activity_type: created.activity_type,
    },
  });

  return created;
}

export async function attachDocument(tx: TenantTx, input: AttachDocumentInput) {
  const result = await tx.client.query(
    `
      INSERT INTO documents (
        agency_id,
        entity_type,
        entity_id,
        file_name,
        mime_type,
        file_size,
        storage_key,
        checksum,
        tags,
        version,
        is_confidential,
        metadata,
        created_by,
        updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14
      )
      RETURNING *
    `,
    [
      tx.session.agency_id,
      input.entity_type,
      input.entity_id,
      input.file_name,
      input.mime_type ?? null,
      input.file_size ?? null,
      input.storage_key,
      input.checksum ?? null,
      input.tags ?? [],
      input.version ?? 1,
      input.is_confidential ?? false,
      JSON.stringify(input.metadata ?? {}),
      tx.session.user_id,
      tx.session.user_id,
    ],
  );

  const created = result.rows[0];

  await logAudit(tx.client, {
    agencyId: tx.session.agency_id,
    actorUserId: tx.session.user_id,
    action: "document.create",
    entityType: "documents",
    entityId: created.id,
    afterJson: created,
    requestId: tx.meta?.requestId ?? null,
    ipAddress: tx.meta?.ipAddress ?? null,
    userAgent: tx.meta?.userAgent ?? null,
  });

  await emitEvent(tx.client, {
    agencyId: tx.session.agency_id,
    eventType: "document.created",
    entityType: "document",
    entityId: created.id,
    metaJson: {
      entity_type: created.entity_type,
      entity_id: created.entity_id,
      file_name: created.file_name,
    },
  });

  let activity = null;
  if (input.createDocumentAddedActivity ?? true) {
    activity = await createActivity(tx, {
      entity_type: created.entity_type,
      entity_id: created.entity_id,
      activity_type: "document_added",
      summary: `Document added: ${created.file_name}`,
      details: {
        document_id: created.id,
        storage_key: created.storage_key,
        mime_type: created.mime_type,
        file_size: created.file_size,
      },
    });
  }

  return {
    document: created,
    activity,
  };
}
