exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS entity_type TEXT,
      ADD COLUMN IF NOT EXISTS entity_id UUID,
      ADD COLUMN IF NOT EXISTS file_size BIGINT,
      ADD COLUMN IF NOT EXISTS checksum TEXT,
      ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS is_confidential BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS updated_by UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE documents
    SET
      entity_type = COALESCE(entity_type, 'policy'),
      entity_id = COALESCE(entity_id, gen_random_uuid());

    ALTER TABLE documents
      ALTER COLUMN entity_type SET NOT NULL,
      ALTER COLUMN entity_id SET NOT NULL;

    ALTER TABLE documents
      DROP CONSTRAINT IF EXISTS documents_entity_type_check;

    ALTER TABLE documents
      ADD CONSTRAINT documents_entity_type_check
      CHECK (entity_type IN ('policy','service_case','contact','policy_transaction','carrier'));

    DROP INDEX IF EXISTS documents_agency_entity_created_at_idx;
    DROP INDEX IF EXISTS documents_agency_storage_key_uidx;

    CREATE INDEX IF NOT EXISTS documents_agency_entity_created_at_idx
      ON documents (agency_id, entity_type, entity_id, created_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS documents_agency_storage_key_uidx
      ON documents (agency_id, storage_key);

    DROP POLICY IF EXISTS documents_select_policy ON documents;
    DROP POLICY IF EXISTS documents_insert_policy ON documents;
    DROP POLICY IF EXISTS documents_update_policy ON documents;
    DROP POLICY IF EXISTS documents_delete_policy ON documents;

    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
    ALTER TABLE documents FORCE ROW LEVEL SECURITY;

    CREATE POLICY documents_select_policy
    ON documents
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY documents_insert_policy
    ON documents
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY documents_update_policy
    ON documents
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY documents_delete_policy
    ON documents
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS documents_delete_policy ON documents;
    DROP POLICY IF EXISTS documents_update_policy ON documents;
    DROP POLICY IF EXISTS documents_insert_policy ON documents;
    DROP POLICY IF EXISTS documents_select_policy ON documents;

    CREATE POLICY documents_select_policy
    ON documents
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY documents_insert_policy
    ON documents
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY documents_update_policy
    ON documents
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY documents_delete_policy
    ON documents
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP INDEX IF EXISTS documents_agency_storage_key_uidx;
    DROP INDEX IF EXISTS documents_agency_entity_created_at_idx;

    ALTER TABLE documents
      DROP CONSTRAINT IF EXISTS documents_entity_type_check;

    ALTER TABLE documents
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS is_confidential,
      DROP COLUMN IF EXISTS version,
      DROP COLUMN IF EXISTS tags,
      DROP COLUMN IF EXISTS checksum,
      DROP COLUMN IF EXISTS file_size,
      DROP COLUMN IF EXISTS entity_id,
      DROP COLUMN IF EXISTS entity_type;
  `);
};
