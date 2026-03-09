exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS policy_endorsements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      endorsement_number TEXT,
      effective_date DATE NOT NULL,
      endorsement_type TEXT NOT NULL,
      description TEXT,
      premium_change NUMERIC,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT policy_endorsements_endorsement_type_check
        CHECK (endorsement_type IN ('addition', 'removal', 'change'))
    );

    CREATE INDEX IF NOT EXISTS policy_endorsements_agency_policy_idx
      ON policy_endorsements (agency_id, policy_id);

    ALTER TABLE policy_endorsements ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_endorsements FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS policy_endorsements_select_policy ON policy_endorsements;
    DROP POLICY IF EXISTS policy_endorsements_insert_policy ON policy_endorsements;
    DROP POLICY IF EXISTS policy_endorsements_update_policy ON policy_endorsements;
    DROP POLICY IF EXISTS policy_endorsements_delete_policy ON policy_endorsements;

    CREATE POLICY policy_endorsements_select_policy
    ON policy_endorsements
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_endorsements_insert_policy
    ON policy_endorsements
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_endorsements_update_policy
    ON policy_endorsements
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_endorsements_delete_policy
    ON policy_endorsements
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS policy_endorsements_set_updated_at ON policy_endorsements;
    CREATE TRIGGER policy_endorsements_set_updated_at
    BEFORE UPDATE ON policy_endorsements
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION policy_endorsements_validate_same_agency()
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
          'policy_endorsements cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS policy_endorsements_validate_same_agency_trg ON policy_endorsements;
    CREATE TRIGGER policy_endorsements_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id
    ON policy_endorsements
    FOR EACH ROW
    EXECUTE FUNCTION policy_endorsements_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS policy_endorsements_validate_same_agency_trg ON policy_endorsements;
    DROP FUNCTION IF EXISTS policy_endorsements_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_endorsements_set_updated_at ON policy_endorsements;

    DROP POLICY IF EXISTS policy_endorsements_delete_policy ON policy_endorsements;
    DROP POLICY IF EXISTS policy_endorsements_update_policy ON policy_endorsements;
    DROP POLICY IF EXISTS policy_endorsements_insert_policy ON policy_endorsements;
    DROP POLICY IF EXISTS policy_endorsements_select_policy ON policy_endorsements;

    DROP TABLE IF EXISTS policy_endorsements;
  `);
};
