exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS policy_schedule_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      schedule_type TEXT NOT NULL,
      description TEXT NOT NULL,
      value NUMERIC,
      identifier TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT policy_schedule_items_schedule_type_check
        CHECK (schedule_type IN ('vehicle', 'location', 'equipment', 'employee'))
    );

    CREATE INDEX IF NOT EXISTS policy_schedule_items_agency_policy_idx
      ON policy_schedule_items (agency_id, policy_id);

    CREATE INDEX IF NOT EXISTS policy_schedule_items_agency_schedule_type_idx
      ON policy_schedule_items (agency_id, schedule_type);

    ALTER TABLE policy_schedule_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_schedule_items FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS policy_schedule_items_select_policy ON policy_schedule_items;
    DROP POLICY IF EXISTS policy_schedule_items_insert_policy ON policy_schedule_items;
    DROP POLICY IF EXISTS policy_schedule_items_update_policy ON policy_schedule_items;
    DROP POLICY IF EXISTS policy_schedule_items_delete_policy ON policy_schedule_items;

    CREATE POLICY policy_schedule_items_select_policy
    ON policy_schedule_items
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_schedule_items_insert_policy
    ON policy_schedule_items
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_schedule_items_update_policy
    ON policy_schedule_items
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_schedule_items_delete_policy
    ON policy_schedule_items
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS policy_schedule_items_set_updated_at ON policy_schedule_items;
    CREATE TRIGGER policy_schedule_items_set_updated_at
    BEFORE UPDATE ON policy_schedule_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION policy_schedule_items_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      policy_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM policies
        WHERE id = NEW.policy_id
          AND agency_id = NEW.agency_id
      ) INTO policy_exists;

      IF NOT policy_exists THEN
        RAISE EXCEPTION
          'policy_schedule_items cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS policy_schedule_items_validate_same_agency_trg ON policy_schedule_items;
    CREATE TRIGGER policy_schedule_items_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id
    ON policy_schedule_items
    FOR EACH ROW
    EXECUTE FUNCTION policy_schedule_items_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS policy_schedule_items_validate_same_agency_trg ON policy_schedule_items;
    DROP FUNCTION IF EXISTS policy_schedule_items_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_schedule_items_set_updated_at ON policy_schedule_items;

    DROP POLICY IF EXISTS policy_schedule_items_delete_policy ON policy_schedule_items;
    DROP POLICY IF EXISTS policy_schedule_items_update_policy ON policy_schedule_items;
    DROP POLICY IF EXISTS policy_schedule_items_insert_policy ON policy_schedule_items;
    DROP POLICY IF EXISTS policy_schedule_items_select_policy ON policy_schedule_items;

    DROP TABLE IF EXISTS policy_schedule_items;
  `);
};
