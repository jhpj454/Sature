exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS crm_pipelines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      name TEXT NOT NULL,
      description TEXT,
      visibility_type TEXT NOT NULL DEFAULT 'private',
      owner_user_id UUID REFERENCES users(id),
      team_id UUID,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by_user_id UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_pipelines_visibility_type_check
        CHECK (visibility_type IN ('private', 'team', 'agency'))
    );

    CREATE INDEX IF NOT EXISTS crm_pipelines_agency_active_idx
      ON crm_pipelines (agency_id, is_active, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_pipelines_agency_owner_idx
      ON crm_pipelines (agency_id, owner_user_id);

    CREATE INDEX IF NOT EXISTS crm_pipelines_agency_visibility_idx
      ON crm_pipelines (agency_id, visibility_type);

    CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      stage_type TEXT NOT NULL,
      probability_pct INTEGER NOT NULL,
      forecast_category TEXT NOT NULL,
      description TEXT,
      required_fields_json JSONB,
      sort_order INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_pipeline_stages_stage_type_check
        CHECK (stage_type IN ('open', 'won', 'lost')),
      CONSTRAINT crm_pipeline_stages_probability_pct_check
        CHECK (probability_pct >= 0 AND probability_pct <= 100),
      CONSTRAINT crm_pipeline_stages_forecast_category_check
        CHECK (forecast_category IN ('pipeline', 'best_case', 'commit', 'closed', 'omitted'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS crm_pipeline_stages_pipeline_sort_order_uidx
      ON crm_pipeline_stages (pipeline_id, sort_order);

    CREATE INDEX IF NOT EXISTS crm_pipeline_stages_agency_pipeline_idx
      ON crm_pipeline_stages (agency_id, pipeline_id, sort_order);

    CREATE TABLE IF NOT EXISTS crm_deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id),
      pipeline_stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id),
      account_id UUID REFERENCES accounts(id),
      lead_id UUID,
      producer_user_id UUID NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      estimated_revenue NUMERIC(12,2) NOT NULL,
      estimated_premium NUMERIC(12,2),
      estimated_commission_pct NUMERIC(7,4),
      expected_close_date DATE,
      next_step TEXT,
      next_step_due_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_deals_status_check
        CHECK (status IN ('open', 'won', 'lost', 'archived')),
      CONSTRAINT crm_deals_estimated_revenue_check
        CHECK (estimated_revenue >= 0),
      CONSTRAINT crm_deals_estimated_premium_check
        CHECK (estimated_premium IS NULL OR estimated_premium >= 0),
      CONSTRAINT crm_deals_estimated_commission_pct_check
        CHECK (
          estimated_commission_pct IS NULL
          OR (estimated_commission_pct >= 0 AND estimated_commission_pct <= 1)
        )
    );

    CREATE INDEX IF NOT EXISTS crm_deals_agency_pipeline_idx
      ON crm_deals (agency_id, pipeline_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_deals_agency_stage_idx
      ON crm_deals (agency_id, pipeline_stage_id);

    CREATE INDEX IF NOT EXISTS crm_deals_agency_producer_idx
      ON crm_deals (agency_id, producer_user_id);

    CREATE INDEX IF NOT EXISTS crm_deals_agency_status_close_idx
      ON crm_deals (agency_id, status, expected_close_date);

    CREATE INDEX IF NOT EXISTS crm_pipelines_agency_id_id_idx
      ON crm_pipelines (agency_id, id);

    CREATE INDEX IF NOT EXISTS crm_pipeline_stages_agency_id_id_idx
      ON crm_pipeline_stages (agency_id, id);

    CREATE INDEX IF NOT EXISTS crm_deals_agency_id_id_idx
      ON crm_deals (agency_id, id);

    ALTER TABLE crm_pipelines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE crm_pipelines FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS crm_pipelines_select_policy ON crm_pipelines;
    DROP POLICY IF EXISTS crm_pipelines_insert_policy ON crm_pipelines;
    DROP POLICY IF EXISTS crm_pipelines_update_policy ON crm_pipelines;
    DROP POLICY IF EXISTS crm_pipelines_delete_policy ON crm_pipelines;

    CREATE POLICY crm_pipelines_select_policy
    ON crm_pipelines
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_pipelines_insert_policy
    ON crm_pipelines
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_pipelines_update_policy
    ON crm_pipelines
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_pipelines_delete_policy
    ON crm_pipelines
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE crm_pipeline_stages FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS crm_pipeline_stages_select_policy ON crm_pipeline_stages;
    DROP POLICY IF EXISTS crm_pipeline_stages_insert_policy ON crm_pipeline_stages;
    DROP POLICY IF EXISTS crm_pipeline_stages_update_policy ON crm_pipeline_stages;
    DROP POLICY IF EXISTS crm_pipeline_stages_delete_policy ON crm_pipeline_stages;

    CREATE POLICY crm_pipeline_stages_select_policy
    ON crm_pipeline_stages
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_pipeline_stages_insert_policy
    ON crm_pipeline_stages
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_pipeline_stages_update_policy
    ON crm_pipeline_stages
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_pipeline_stages_delete_policy
    ON crm_pipeline_stages
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE crm_deals FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS crm_deals_select_policy ON crm_deals;
    DROP POLICY IF EXISTS crm_deals_insert_policy ON crm_deals;
    DROP POLICY IF EXISTS crm_deals_update_policy ON crm_deals;
    DROP POLICY IF EXISTS crm_deals_delete_policy ON crm_deals;

    CREATE POLICY crm_deals_select_policy
    ON crm_deals
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_deals_insert_policy
    ON crm_deals
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_deals_update_policy
    ON crm_deals
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY crm_deals_delete_policy
    ON crm_deals
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS crm_pipelines_set_updated_at ON crm_pipelines;
    CREATE TRIGGER crm_pipelines_set_updated_at
    BEFORE UPDATE ON crm_pipelines
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    DROP TRIGGER IF EXISTS crm_pipeline_stages_set_updated_at ON crm_pipeline_stages;
    CREATE TRIGGER crm_pipeline_stages_set_updated_at
    BEFORE UPDATE ON crm_pipeline_stages
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    DROP TRIGGER IF EXISTS crm_deals_set_updated_at ON crm_deals;
    CREATE TRIGGER crm_deals_set_updated_at
    BEFORE UPDATE ON crm_deals
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION crm_pipelines_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      owner_exists BOOLEAN;
      creator_exists BOOLEAN;
    BEGIN
      IF NEW.owner_user_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1
          FROM users
          WHERE id = NEW.owner_user_id
            AND agency_id = NEW.agency_id
        ) INTO owner_exists;

        IF NOT owner_exists THEN
          RAISE EXCEPTION
            'crm_pipelines cross-agency or missing owner reference: owner_user_id=% agency_id=%',
            NEW.owner_user_id,
            NEW.agency_id;
        END IF;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM users
        WHERE id = NEW.created_by_user_id
          AND agency_id = NEW.agency_id
      ) INTO creator_exists;

      IF NOT creator_exists THEN
        RAISE EXCEPTION
          'crm_pipelines cross-agency or missing creator reference: created_by_user_id=% agency_id=%',
          NEW.created_by_user_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION crm_pipeline_stages_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      pipeline_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM crm_pipelines
        WHERE id = NEW.pipeline_id
          AND agency_id = NEW.agency_id
      ) INTO pipeline_exists;

      IF NOT pipeline_exists THEN
        RAISE EXCEPTION
          'crm_pipeline_stages cross-agency or missing pipeline reference: pipeline_id=% agency_id=%',
          NEW.pipeline_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION crm_deals_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      pipeline_exists BOOLEAN;
      stage_matches BOOLEAN;
      account_exists BOOLEAN;
      producer_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM crm_pipelines
        WHERE id = NEW.pipeline_id
          AND agency_id = NEW.agency_id
      ) INTO pipeline_exists;

      IF NOT pipeline_exists THEN
        RAISE EXCEPTION
          'crm_deals cross-agency or missing pipeline reference: pipeline_id=% agency_id=%',
          NEW.pipeline_id,
          NEW.agency_id;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM crm_pipeline_stages
        WHERE id = NEW.pipeline_stage_id
          AND agency_id = NEW.agency_id
          AND pipeline_id = NEW.pipeline_id
      ) INTO stage_matches;

      IF NOT stage_matches THEN
        RAISE EXCEPTION
          'crm_deals cross-agency or invalid stage reference: pipeline_stage_id=% pipeline_id=% agency_id=%',
          NEW.pipeline_stage_id,
          NEW.pipeline_id,
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
            'crm_deals cross-agency or missing account reference: account_id=% agency_id=%',
            NEW.account_id,
            NEW.agency_id;
        END IF;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM users
        WHERE id = NEW.producer_user_id
          AND agency_id = NEW.agency_id
      ) INTO producer_exists;

      IF NOT producer_exists THEN
        RAISE EXCEPTION
          'crm_deals cross-agency or missing producer reference: producer_user_id=% agency_id=%',
          NEW.producer_user_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS crm_pipelines_validate_same_agency_trg ON crm_pipelines;
    CREATE TRIGGER crm_pipelines_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, owner_user_id, created_by_user_id
    ON crm_pipelines
    FOR EACH ROW
    EXECUTE FUNCTION crm_pipelines_validate_same_agency();

    DROP TRIGGER IF EXISTS crm_pipeline_stages_validate_same_agency_trg ON crm_pipeline_stages;
    CREATE TRIGGER crm_pipeline_stages_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, pipeline_id
    ON crm_pipeline_stages
    FOR EACH ROW
    EXECUTE FUNCTION crm_pipeline_stages_validate_same_agency();

    DROP TRIGGER IF EXISTS crm_deals_validate_same_agency_trg ON crm_deals;
    CREATE TRIGGER crm_deals_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, pipeline_id, pipeline_stage_id, account_id, producer_user_id
    ON crm_deals
    FOR EACH ROW
    EXECUTE FUNCTION crm_deals_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS crm_deals_validate_same_agency_trg ON crm_deals;
    DROP TRIGGER IF EXISTS crm_pipeline_stages_validate_same_agency_trg ON crm_pipeline_stages;
    DROP TRIGGER IF EXISTS crm_pipelines_validate_same_agency_trg ON crm_pipelines;

    DROP FUNCTION IF EXISTS crm_deals_validate_same_agency();
    DROP FUNCTION IF EXISTS crm_pipeline_stages_validate_same_agency();
    DROP FUNCTION IF EXISTS crm_pipelines_validate_same_agency();

    DROP TRIGGER IF EXISTS crm_deals_set_updated_at ON crm_deals;
    DROP TRIGGER IF EXISTS crm_pipeline_stages_set_updated_at ON crm_pipeline_stages;
    DROP TRIGGER IF EXISTS crm_pipelines_set_updated_at ON crm_pipelines;

    DROP POLICY IF EXISTS crm_deals_delete_policy ON crm_deals;
    DROP POLICY IF EXISTS crm_deals_update_policy ON crm_deals;
    DROP POLICY IF EXISTS crm_deals_insert_policy ON crm_deals;
    DROP POLICY IF EXISTS crm_deals_select_policy ON crm_deals;

    DROP POLICY IF EXISTS crm_pipeline_stages_delete_policy ON crm_pipeline_stages;
    DROP POLICY IF EXISTS crm_pipeline_stages_update_policy ON crm_pipeline_stages;
    DROP POLICY IF EXISTS crm_pipeline_stages_insert_policy ON crm_pipeline_stages;
    DROP POLICY IF EXISTS crm_pipeline_stages_select_policy ON crm_pipeline_stages;

    DROP POLICY IF EXISTS crm_pipelines_delete_policy ON crm_pipelines;
    DROP POLICY IF EXISTS crm_pipelines_update_policy ON crm_pipelines;
    DROP POLICY IF EXISTS crm_pipelines_insert_policy ON crm_pipelines;
    DROP POLICY IF EXISTS crm_pipelines_select_policy ON crm_pipelines;

    DROP TABLE IF EXISTS crm_deals;
    DROP TABLE IF EXISTS crm_pipeline_stages;
    DROP TABLE IF EXISTS crm_pipelines;
  `);
};
