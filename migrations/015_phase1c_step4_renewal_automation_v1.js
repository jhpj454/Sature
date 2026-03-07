exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS renewal_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      is_enabled BOOLEAN NOT NULL DEFAULT true,
      days_before_expiration INT NOT NULL,
      create_case BOOLEAN NOT NULL DEFAULT true,
      case_priority TEXT NOT NULL DEFAULT 'normal',
      assign_to UUID REFERENCES users(id),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      deleted_at TIMESTAMPTZ
    );

    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_days_before_expiration_check,
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_days_before_expiration_check
      CHECK (days_before_expiration > 0 AND days_before_expiration <= 365),
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high', 'urgent'));

    CREATE INDEX IF NOT EXISTS renewal_rules_agency_enabled_days_idx
      ON renewal_rules (agency_id, is_enabled, days_before_expiration);

    CREATE TABLE IF NOT EXISTS job_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      job_name TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'running',
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      deleted_at TIMESTAMPTZ
    );

    ALTER TABLE job_runs
      DROP CONSTRAINT IF EXISTS job_runs_status_check;

    ALTER TABLE job_runs
      ADD CONSTRAINT job_runs_status_check
      CHECK (status IN ('running', 'success', 'failed'));

    CREATE INDEX IF NOT EXISTS job_runs_agency_job_name_started_idx
      ON job_runs (agency_id, job_name, started_at DESC);

    CREATE INDEX IF NOT EXISTS job_runs_agency_status_started_idx
      ON job_runs (agency_id, status, started_at DESC);

    ALTER TABLE service_cases
      ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    CREATE UNIQUE INDEX IF NOT EXISTS service_cases_agency_dedupe_key_active_uidx
      ON service_cases (agency_id, dedupe_key)
      WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL;

    CREATE INDEX IF NOT EXISTS policies_agency_expiration_date_idx
      ON policies (agency_id, expiration_date);

    CREATE INDEX IF NOT EXISTS policies_agency_renewal_status_expiration_idx
      ON policies (agency_id, renewal_status, expiration_date);

    ALTER TABLE renewal_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE renewal_rules FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS renewal_rules_select_policy ON renewal_rules;
    DROP POLICY IF EXISTS renewal_rules_insert_policy ON renewal_rules;
    DROP POLICY IF EXISTS renewal_rules_update_policy ON renewal_rules;
    DROP POLICY IF EXISTS renewal_rules_delete_policy ON renewal_rules;

    CREATE POLICY renewal_rules_select_policy
    ON renewal_rules
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY renewal_rules_insert_policy
    ON renewal_rules
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY renewal_rules_update_policy
    ON renewal_rules
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY renewal_rules_delete_policy
    ON renewal_rules
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE job_runs FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS job_runs_select_policy ON job_runs;
    DROP POLICY IF EXISTS job_runs_insert_policy ON job_runs;
    DROP POLICY IF EXISTS job_runs_update_policy ON job_runs;
    DROP POLICY IF EXISTS job_runs_delete_policy ON job_runs;

    CREATE POLICY job_runs_select_policy
    ON job_runs
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY job_runs_insert_policy
    ON job_runs
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY job_runs_update_policy
    ON job_runs
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY job_runs_delete_policy
    ON job_runs
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS renewal_rules_set_updated_at ON renewal_rules;
    CREATE TRIGGER renewal_rules_set_updated_at
    BEFORE UPDATE ON renewal_rules
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    DROP TRIGGER IF EXISTS job_runs_set_updated_at ON job_runs;
    CREATE TRIGGER job_runs_set_updated_at
    BEFORE UPDATE ON job_runs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION renewal_rules_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      assignee_exists BOOLEAN;
    BEGIN
      IF NEW.assign_to IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM users
        WHERE id = NEW.assign_to
          AND agency_id = NEW.agency_id
      ) INTO assignee_exists;

      IF NOT assignee_exists THEN
        RAISE EXCEPTION
          'renewal_rules cross-agency or missing assign_to reference: assign_to=% agency_id=%',
          NEW.assign_to,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION job_runs_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      actor_exists BOOLEAN;
    BEGIN
      IF NEW.created_by IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1
          FROM users
          WHERE id = NEW.created_by
            AND agency_id = NEW.agency_id
        ) INTO actor_exists;

        IF NOT actor_exists THEN
          RAISE EXCEPTION
            'job_runs cross-agency or missing created_by reference: created_by=% agency_id=%',
            NEW.created_by,
            NEW.agency_id;
        END IF;
      END IF;

      IF NEW.updated_by IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1
          FROM users
          WHERE id = NEW.updated_by
            AND agency_id = NEW.agency_id
        ) INTO actor_exists;

        IF NOT actor_exists THEN
          RAISE EXCEPTION
            'job_runs cross-agency or missing updated_by reference: updated_by=% agency_id=%',
            NEW.updated_by,
            NEW.agency_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS renewal_rules_validate_same_agency_trg ON renewal_rules;
    CREATE TRIGGER renewal_rules_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, assign_to
    ON renewal_rules
    FOR EACH ROW
    EXECUTE FUNCTION renewal_rules_validate_same_agency();

    DROP TRIGGER IF EXISTS job_runs_validate_same_agency_trg ON job_runs;
    CREATE TRIGGER job_runs_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, created_by, updated_by
    ON job_runs
    FOR EACH ROW
    EXECUTE FUNCTION job_runs_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS job_runs_validate_same_agency_trg ON job_runs;
    DROP TRIGGER IF EXISTS renewal_rules_validate_same_agency_trg ON renewal_rules;

    DROP FUNCTION IF EXISTS job_runs_validate_same_agency();
    DROP FUNCTION IF EXISTS renewal_rules_validate_same_agency();

    DROP TRIGGER IF EXISTS job_runs_set_updated_at ON job_runs;
    DROP TRIGGER IF EXISTS renewal_rules_set_updated_at ON renewal_rules;

    DROP POLICY IF EXISTS job_runs_delete_policy ON job_runs;
    DROP POLICY IF EXISTS job_runs_update_policy ON job_runs;
    DROP POLICY IF EXISTS job_runs_insert_policy ON job_runs;
    DROP POLICY IF EXISTS job_runs_select_policy ON job_runs;

    DROP POLICY IF EXISTS renewal_rules_delete_policy ON renewal_rules;
    DROP POLICY IF EXISTS renewal_rules_update_policy ON renewal_rules;
    DROP POLICY IF EXISTS renewal_rules_insert_policy ON renewal_rules;
    DROP POLICY IF EXISTS renewal_rules_select_policy ON renewal_rules;

    DROP INDEX IF EXISTS service_cases_agency_dedupe_key_active_uidx;

    ALTER TABLE service_cases
      DROP COLUMN IF EXISTS dedupe_key;

    DROP TABLE IF EXISTS job_runs;
    DROP TABLE IF EXISTS renewal_rules;
  `);
};
