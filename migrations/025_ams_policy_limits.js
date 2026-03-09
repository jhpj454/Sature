exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS policy_limits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      limit_type TEXT NOT NULL,
      limit_amount NUMERIC NOT NULL,
      applies_to TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS policy_limits_agency_policy_idx
      ON policy_limits (agency_id, policy_id);

    ALTER TABLE policy_limits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_limits FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS policy_limits_select_policy ON policy_limits;
    DROP POLICY IF EXISTS policy_limits_insert_policy ON policy_limits;
    DROP POLICY IF EXISTS policy_limits_update_policy ON policy_limits;
    DROP POLICY IF EXISTS policy_limits_delete_policy ON policy_limits;

    CREATE POLICY policy_limits_select_policy
    ON policy_limits
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_limits_insert_policy
    ON policy_limits
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_limits_update_policy
    ON policy_limits
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_limits_delete_policy
    ON policy_limits
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS policy_limits_set_updated_at ON policy_limits;
    CREATE TRIGGER policy_limits_set_updated_at
    BEFORE UPDATE ON policy_limits
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION policy_limits_validate_same_agency()
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
          'policy_limits cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS policy_limits_validate_same_agency_trg ON policy_limits;
    CREATE TRIGGER policy_limits_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id
    ON policy_limits
    FOR EACH ROW
    EXECUTE FUNCTION policy_limits_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS policy_limits_validate_same_agency_trg ON policy_limits;
    DROP FUNCTION IF EXISTS policy_limits_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_limits_set_updated_at ON policy_limits;

    DROP POLICY IF EXISTS policy_limits_delete_policy ON policy_limits;
    DROP POLICY IF EXISTS policy_limits_update_policy ON policy_limits;
    DROP POLICY IF EXISTS policy_limits_insert_policy ON policy_limits;
    DROP POLICY IF EXISTS policy_limits_select_policy ON policy_limits;

    DROP TABLE IF EXISTS policy_limits;
  `);
};
