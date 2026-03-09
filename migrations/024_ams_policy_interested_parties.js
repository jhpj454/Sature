exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS policy_interested_parties (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      account_id UUID REFERENCES accounts(id),
      party_type TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      description TEXT,
      effective_date DATE,
      expiration_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT policy_interested_parties_party_type_check
        CHECK (party_type IN (
          'named_insured',
          'additional_insured',
          'loss_payee',
          'mortgagee',
          'lessor',
          'certificate_holder'
        ))
    );

    CREATE INDEX IF NOT EXISTS policy_interested_parties_agency_policy_idx
      ON policy_interested_parties (agency_id, policy_id);

    CREATE INDEX IF NOT EXISTS policy_interested_parties_agency_id_idx
      ON policy_interested_parties (agency_id);

    ALTER TABLE policy_interested_parties ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_interested_parties FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS policy_interested_parties_select_policy ON policy_interested_parties;
    DROP POLICY IF EXISTS policy_interested_parties_insert_policy ON policy_interested_parties;
    DROP POLICY IF EXISTS policy_interested_parties_update_policy ON policy_interested_parties;
    DROP POLICY IF EXISTS policy_interested_parties_delete_policy ON policy_interested_parties;

    CREATE POLICY policy_interested_parties_select_policy
    ON policy_interested_parties
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_interested_parties_insert_policy
    ON policy_interested_parties
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_interested_parties_update_policy
    ON policy_interested_parties
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_interested_parties_delete_policy
    ON policy_interested_parties
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS policy_interested_parties_set_updated_at ON policy_interested_parties;
    CREATE TRIGGER policy_interested_parties_set_updated_at
    BEFORE UPDATE ON policy_interested_parties
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION policy_interested_parties_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      policy_exists BOOLEAN;
      account_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM policies
        WHERE id = NEW.policy_id
          AND agency_id = NEW.agency_id
      ) INTO policy_exists;

      IF NOT policy_exists THEN
        RAISE EXCEPTION
          'policy_interested_parties cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      IF NEW.account_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1
          FROM accounts
          WHERE id = NEW.account_id
            AND agency_id = NEW.agency_id
        ) INTO account_exists;

        IF NOT account_exists THEN
          RAISE EXCEPTION
            'policy_interested_parties cross-agency or missing account reference: account_id=% agency_id=%',
            NEW.account_id,
            NEW.agency_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS policy_interested_parties_validate_same_agency_trg ON policy_interested_parties;
    CREATE TRIGGER policy_interested_parties_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id, account_id
    ON policy_interested_parties
    FOR EACH ROW
    EXECUTE FUNCTION policy_interested_parties_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS policy_interested_parties_validate_same_agency_trg ON policy_interested_parties;
    DROP FUNCTION IF EXISTS policy_interested_parties_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_interested_parties_set_updated_at ON policy_interested_parties;

    DROP POLICY IF EXISTS policy_interested_parties_delete_policy ON policy_interested_parties;
    DROP POLICY IF EXISTS policy_interested_parties_update_policy ON policy_interested_parties;
    DROP POLICY IF EXISTS policy_interested_parties_insert_policy ON policy_interested_parties;
    DROP POLICY IF EXISTS policy_interested_parties_select_policy ON policy_interested_parties;

    DROP TABLE IF EXISTS policy_interested_parties;
  `);
};
