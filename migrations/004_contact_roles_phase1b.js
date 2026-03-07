exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE contact_roles
      ADD COLUMN IF NOT EXISTS entity_type TEXT,
      ADD COLUMN IF NOT EXISTS entity_id UUID,
      ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS start_date DATE,
      ADD COLUMN IF NOT EXISTS end_date DATE,
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS updated_by UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE contact_roles
    SET
      entity_type = 'policy',
      entity_id = account_id
    WHERE entity_type IS NULL OR entity_id IS NULL;

    ALTER TABLE contact_roles
      ALTER COLUMN entity_type SET NOT NULL,
      ALTER COLUMN entity_id SET NOT NULL;

    ALTER TABLE contact_roles
      DROP CONSTRAINT IF EXISTS contact_roles_entity_type_check,
      DROP CONSTRAINT IF EXISTS contact_roles_unique_contact_role;

    ALTER TABLE contact_roles
      DROP COLUMN IF EXISTS account_id;

    ALTER TABLE contact_roles
      ALTER COLUMN role TYPE TEXT USING role::TEXT;

    ALTER TABLE contact_roles
      ADD CONSTRAINT contact_roles_entity_type_check
      CHECK (entity_type IN ('policy', 'service_case'));

    DROP INDEX IF EXISTS contact_roles_agency_entity_idx;
    DROP INDEX IF EXISTS contact_roles_agency_contact_idx;
    DROP INDEX IF EXISTS contact_roles_unique_active_idx;

    CREATE INDEX IF NOT EXISTS contact_roles_agency_entity_idx
      ON contact_roles (agency_id, entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS contact_roles_agency_contact_idx
      ON contact_roles (agency_id, contact_id);

    CREATE UNIQUE INDEX IF NOT EXISTS contact_roles_unique_active_idx
      ON contact_roles (agency_id, entity_type, entity_id, role, contact_id)
      WHERE deleted_at IS NULL;

    DROP POLICY IF EXISTS contact_roles_select_policy ON contact_roles;
    DROP POLICY IF EXISTS contact_roles_insert_policy ON contact_roles;
    DROP POLICY IF EXISTS contact_roles_update_policy ON contact_roles;
    DROP POLICY IF EXISTS contact_roles_delete_policy ON contact_roles;

    ALTER TABLE contact_roles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE contact_roles FORCE ROW LEVEL SECURITY;

    CREATE POLICY contact_roles_select_policy
    ON contact_roles
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY contact_roles_insert_policy
    ON contact_roles
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY contact_roles_update_policy
    ON contact_roles
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY contact_roles_delete_policy
    ON contact_roles
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS contact_roles_delete_policy ON contact_roles;
    DROP POLICY IF EXISTS contact_roles_update_policy ON contact_roles;
    DROP POLICY IF EXISTS contact_roles_insert_policy ON contact_roles;
    DROP POLICY IF EXISTS contact_roles_select_policy ON contact_roles;

    CREATE POLICY contact_roles_select_policy
    ON contact_roles
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY contact_roles_insert_policy
    ON contact_roles
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY contact_roles_update_policy
    ON contact_roles
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY contact_roles_delete_policy
    ON contact_roles
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP INDEX IF EXISTS contact_roles_unique_active_idx;
    DROP INDEX IF EXISTS contact_roles_agency_contact_idx;
    DROP INDEX IF EXISTS contact_roles_agency_entity_idx;

    ALTER TABLE contact_roles
      DROP CONSTRAINT IF EXISTS contact_roles_entity_type_check;

    ALTER TABLE contact_roles
      ALTER COLUMN role TYPE contact_role USING role::contact_role;

    ALTER TABLE contact_roles
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);

    ALTER TABLE contact_roles
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS end_date,
      DROP COLUMN IF EXISTS start_date,
      DROP COLUMN IF EXISTS is_primary,
      DROP COLUMN IF EXISTS entity_id,
      DROP COLUMN IF EXISTS entity_type;

    ALTER TABLE contact_roles
      ADD CONSTRAINT contact_roles_unique_contact_role UNIQUE (agency_id, contact_id, role);
  `);
};
