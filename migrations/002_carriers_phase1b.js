exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE carriers
      RENAME COLUMN naic TO naic_code;

    ALTER TABLE carriers
      ADD COLUMN IF NOT EXISTS producer_code TEXT,
      ADD COLUMN IF NOT EXISTS integration_status TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS updated_by UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    ALTER TABLE carriers
      DROP COLUMN IF EXISTS support_contact_json;

    ALTER TABLE carriers
      DROP CONSTRAINT IF EXISTS carriers_integration_status_check;

    ALTER TABLE carriers
      ADD CONSTRAINT carriers_integration_status_check
      CHECK (integration_status IN ('none', 'pending', 'connected', 'error'));

    ALTER TABLE carriers
      DROP CONSTRAINT IF EXISTS carriers_agency_id_name_key;

    DROP INDEX IF EXISTS carriers_agency_id_name_key;

    CREATE UNIQUE INDEX IF NOT EXISTS carriers_agency_name_unique_active_idx
      ON carriers (agency_id, lower(name))
      WHERE deleted_at IS NULL;

    DROP POLICY IF EXISTS carriers_select_policy ON carriers;
    DROP POLICY IF EXISTS carriers_insert_policy ON carriers;
    DROP POLICY IF EXISTS carriers_update_policy ON carriers;
    DROP POLICY IF EXISTS carriers_delete_policy ON carriers;

    ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
    ALTER TABLE carriers FORCE ROW LEVEL SECURITY;

    CREATE POLICY carriers_select_policy
    ON carriers
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY carriers_insert_policy
    ON carriers
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY carriers_update_policy
    ON carriers
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY carriers_delete_policy
    ON carriers
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS carriers_delete_policy ON carriers;
    DROP POLICY IF EXISTS carriers_update_policy ON carriers;
    DROP POLICY IF EXISTS carriers_insert_policy ON carriers;
    DROP POLICY IF EXISTS carriers_select_policy ON carriers;

    CREATE POLICY carriers_select_policy
    ON carriers
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY carriers_insert_policy
    ON carriers
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY carriers_update_policy
    ON carriers
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY carriers_delete_policy
    ON carriers
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP INDEX IF EXISTS carriers_agency_name_unique_active_idx;

    ALTER TABLE carriers
      DROP CONSTRAINT IF EXISTS carriers_integration_status_check;

    ALTER TABLE carriers
      ADD CONSTRAINT carriers_agency_id_name_key UNIQUE (agency_id, name);

    ALTER TABLE carriers
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS integration_status,
      DROP COLUMN IF EXISTS producer_code;

    ALTER TABLE carriers
      RENAME COLUMN naic_code TO naic;

    ALTER TABLE carriers
      ADD COLUMN IF NOT EXISTS support_contact_json JSONB;
  `);
};
