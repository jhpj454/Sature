import type { PoolClient } from "pg";

type EventPayload = {
  agencyId: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  contactId?: string | null;
  metaJson?: unknown;
};

export async function emitEvent(client: PoolClient, payload: EventPayload) {
  await client.query(
    `
      INSERT INTO events (
        agency_id,
        event_type,
        entity_type,
        entity_id,
        contact_id,
        meta_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      payload.agencyId,
      payload.eventType,
      payload.entityType ?? null,
      payload.entityId ?? null,
      payload.contactId ?? null,
      payload.metaJson ? JSON.stringify(payload.metaJson) : null,
    ],
  );
}
