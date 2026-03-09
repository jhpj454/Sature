exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS policy_coverages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      coverage_type TEXT NOT NULL,
      description TEXT,
      deductible NUMERIC,
      deductible_type TEXT,
      effective_date DATE,
      expiration_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT policy_coverages_deductible_type_check
        CHECK (deductible_type IS NULL OR deductible_type IN ('flat', 'percentage'))
    );

    CREATE INDEX IF NOT EXISTS policy_coverages_agency_policy_idx
      ON policy_coverages (agency_id, policy_id);

    ALTER TABLE policy_coverages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_coverages FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS policy_coverages_select_policy ON policy_coverages;
    DROP POLICY IF EXISTS policy_coverages_insert_policy ON policy_coverages;
    DROP POLICY IF EXISTS policy_coverages_update_policy ON policy_coverages;
    DROP POLICY IF EXISTS policy_coverages_delete_policy ON policy_coverages;

    CREATE POLICY policy_coverages_select_policy
    ON policy_coverages
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_coverages_insert_policy
    ON policy_coverages
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_coverages_update_policy
    ON policy_coverages
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_coverages_delete_policy
    ON policy_coverages
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS policy_coverages_set_updated_at ON policy_coverages;
    CREATE TRIGGER policy_coverages_set_updated_at
    BEFORE UPDATE ON policy_coverages
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION policy_coverages_validate_same_agency()
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
          'policy_coverages cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS policy_coverages_validate_same_agency_trg ON policy_coverages;
    CREATE TRIGGER policy_coverages_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id
    ON policy_coverages
    FOR EACH ROW
    EXECUTE FUNCTION policy_coverages_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS policy_coverages_validate_same_agency_trg ON policy_coverages;
    DROP FUNCTION IF EXISTS policy_coverages_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_coverages_set_updated_at ON policy_coverages;

    DROP POLICY IF EXISTS policy_coverages_delete_policy ON policy_coverages;
    DROP POLICY IF EXISTS policy_coverages_update_policy ON policy_coverages;
    DROP POLICY IF EXISTS policy_coverages_insert_policy ON policy_coverages;
    DROP POLICY IF EXISTS policy_coverages_select_policy ON policy_coverages;

    DROP TABLE IF EXISTS policy_coverages;
  `);
};
