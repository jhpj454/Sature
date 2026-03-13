exports.up = (pgm) => {
  pgm.sql(`
    -- ── certificate_holders ──────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS certificate_holders (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id   UUID        NOT NULL REFERENCES agencies(id),
      account_id  UUID        NOT NULL REFERENCES accounts(id),
      holder_name TEXT        NOT NULL,
      holder_address TEXT     NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS certificate_holders_agency_account_idx
      ON certificate_holders (agency_id, account_id);

    ALTER TABLE certificate_holders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE certificate_holders FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS certificate_holders_select ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_insert ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_update ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_delete ON certificate_holders;

    CREATE POLICY certificate_holders_select ON certificate_holders
      FOR SELECT USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY certificate_holders_insert ON certificate_holders
      FOR INSERT WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY certificate_holders_update ON certificate_holders
      FOR UPDATE
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY certificate_holders_delete ON certificate_holders
      FOR DELETE USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS certificate_holders_set_updated_at ON certificate_holders;
    CREATE TRIGGER certificate_holders_set_updated_at
    BEFORE UPDATE ON certificate_holders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();

    -- ── coi_requests ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS coi_requests (
      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id              UUID        NOT NULL REFERENCES agencies(id),
      account_id             UUID        NOT NULL REFERENCES accounts(id),
      policy_id              UUID        NOT NULL REFERENCES policies(id),
      holder_id              UUID        NOT NULL REFERENCES certificate_holders(id),
      status                 TEXT        NOT NULL DEFAULT 'issued'
                               CONSTRAINT coi_requests_status_check
                               CHECK (status IN ('issued', 'revoked')),
      requested_by_user_id   UUID        NULL REFERENCES users(id),
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS coi_requests_agency_policy_idx
      ON coi_requests (agency_id, policy_id);

    CREATE INDEX IF NOT EXISTS coi_requests_agency_account_idx
      ON coi_requests (agency_id, account_id);

    ALTER TABLE coi_requests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE coi_requests FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS coi_requests_select ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_insert ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_update ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_delete ON coi_requests;

    CREATE POLICY coi_requests_select ON coi_requests
      FOR SELECT USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY coi_requests_insert ON coi_requests
      FOR INSERT WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY coi_requests_update ON coi_requests
      FOR UPDATE
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY coi_requests_delete ON coi_requests
      FOR DELETE USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS coi_requests_set_updated_at ON coi_requests;
    CREATE TRIGGER coi_requests_set_updated_at
    BEFORE UPDATE ON coi_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS coi_requests_set_updated_at ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_delete ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_update ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_insert ON coi_requests;
    DROP POLICY IF EXISTS coi_requests_select ON coi_requests;
    DROP TABLE IF EXISTS coi_requests;

    DROP TRIGGER IF EXISTS certificate_holders_set_updated_at ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_delete ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_update ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_insert ON certificate_holders;
    DROP POLICY IF EXISTS certificate_holders_select ON certificate_holders;
    DROP TABLE IF EXISTS certificate_holders;
  `);
};
