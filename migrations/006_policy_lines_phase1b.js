exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS policy_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_transaction_id UUID NOT NULL REFERENCES policy_transactions(id),
      line_type TEXT NOT NULL,
      state CHAR(2),
      limits JSONB NOT NULL DEFAULT '{}'::jsonb,
      deductibles JSONB NOT NULL DEFAULT '{}'::jsonb,
      exposures JSONB NOT NULL DEFAULT '{}'::jsonb,
      premium NUMERIC(12,2),
      commission NUMERIC(12,2),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      deleted_at TIMESTAMPTZ
    );

    ALTER TABLE policy_lines
      DROP CONSTRAINT IF EXISTS policy_lines_line_type_check;

    ALTER TABLE policy_lines
      ADD CONSTRAINT policy_lines_line_type_check
      CHECK (line_type IN ('auto','home','gl','wc','property','umbrella','life','health','other'));

    CREATE INDEX IF NOT EXISTS policy_lines_agency_transaction_idx
      ON policy_lines (agency_id, policy_transaction_id);

    CREATE INDEX IF NOT EXISTS policy_lines_agency_line_type_idx
      ON policy_lines (agency_id, line_type);

    ALTER TABLE policy_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_lines FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS policy_lines_select_policy ON policy_lines;
    DROP POLICY IF EXISTS policy_lines_insert_policy ON policy_lines;
    DROP POLICY IF EXISTS policy_lines_update_policy ON policy_lines;
    DROP POLICY IF EXISTS policy_lines_delete_policy ON policy_lines;

    CREATE POLICY policy_lines_select_policy
    ON policy_lines
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_lines_insert_policy
    ON policy_lines
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_lines_update_policy
    ON policy_lines
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_lines_delete_policy
    ON policy_lines
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS policy_lines_set_updated_at ON policy_lines;
    CREATE TRIGGER policy_lines_set_updated_at
    BEFORE UPDATE ON policy_lines
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS policy_lines_set_updated_at ON policy_lines;

    DROP POLICY IF EXISTS policy_lines_delete_policy ON policy_lines;
    DROP POLICY IF EXISTS policy_lines_update_policy ON policy_lines;
    DROP POLICY IF EXISTS policy_lines_insert_policy ON policy_lines;
    DROP POLICY IF EXISTS policy_lines_select_policy ON policy_lines;

    DROP TABLE IF EXISTS policy_lines;
  `);
};
