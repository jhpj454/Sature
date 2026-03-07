/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS crm_lead_lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'csv_import',
      uploaded_by_user_id UUID REFERENCES users(id),
      row_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS crm_lead_lists_agency_created_idx
      ON crm_lead_lists (agency_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_lead_lists_agency_uploader_idx
      ON crm_lead_lists (agency_id, uploaded_by_user_id);

    CREATE TABLE IF NOT EXISTS crm_leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
      first_name TEXT,
      last_name TEXT,
      company_name TEXT,
      email TEXT,
      phone TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'new',
      assigned_producer_id UUID REFERENCES users(id),
      assignment_status TEXT NOT NULL DEFAULT 'unassigned'
        CONSTRAINT crm_leads_assignment_status_check
        CHECK (assignment_status IN ('unassigned', 'assigned', 'claimed')),
      lead_list_id UUID REFERENCES crm_lead_lists(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT crm_leads_identity_check
        CHECK (
          COALESCE(NULLIF(trim(first_name), ''), NULLIF(trim(last_name), ''), NULLIF(trim(company_name), ''), NULLIF(trim(email), ''), NULLIF(trim(phone), '')) IS NOT NULL
        )
    );

    CREATE INDEX IF NOT EXISTS crm_leads_agency_created_idx
      ON crm_leads (agency_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_leads_agency_assigned_idx
      ON crm_leads (agency_id, assigned_producer_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_leads_agency_assignment_status_idx
      ON crm_leads (agency_id, assignment_status, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_leads_agency_status_idx
      ON crm_leads (agency_id, status, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_leads_agency_source_idx
      ON crm_leads (agency_id, source, created_at DESC);

    CREATE INDEX IF NOT EXISTS crm_leads_agency_email_idx
      ON crm_leads (agency_id, lower(email));

    CREATE INDEX IF NOT EXISTS crm_leads_agency_name_idx
      ON crm_leads (agency_id, lower(last_name), lower(first_name), lower(company_name));

    ALTER TABLE crm_lead_lists ENABLE ROW LEVEL SECURITY;
    ALTER TABLE crm_lead_lists FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS crm_lead_lists_select_policy ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_lead_lists_insert_policy ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_lead_lists_update_policy ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_lead_lists_delete_policy ON crm_lead_lists;

    CREATE POLICY crm_lead_lists_select_policy
    ON crm_lead_lists
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY crm_lead_lists_insert_policy
    ON crm_lead_lists
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY crm_lead_lists_update_policy
    ON crm_lead_lists
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY crm_lead_lists_delete_policy
    ON crm_lead_lists
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
    ALTER TABLE crm_leads FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS crm_leads_select_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_leads_insert_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_leads_update_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_leads_delete_policy ON crm_leads;

    CREATE POLICY crm_leads_select_policy
    ON crm_leads
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY crm_leads_insert_policy
    ON crm_leads
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY crm_leads_update_policy
    ON crm_leads
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY crm_leads_delete_policy
    ON crm_leads
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP TRIGGER IF EXISTS crm_lead_lists_set_updated_at ON crm_lead_lists;
    CREATE TRIGGER crm_lead_lists_set_updated_at
    BEFORE UPDATE ON crm_lead_lists
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    DROP TRIGGER IF EXISTS crm_leads_set_updated_at ON crm_leads;
    CREATE TRIGGER crm_leads_set_updated_at
    BEFORE UPDATE ON crm_leads
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION crm_lead_lists_validate_same_agency()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.uploaded_by_user_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM users
          WHERE id = NEW.uploaded_by_user_id
            AND agency_id = NEW.agency_id
        ) THEN
          RAISE EXCEPTION
            'crm_lead_lists cross-agency or missing uploader reference: uploaded_by_user_id=% agency_id=%',
            NEW.uploaded_by_user_id,
            NEW.agency_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$;

    CREATE OR REPLACE FUNCTION crm_leads_validate_same_agency()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.assigned_producer_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM users
          WHERE id = NEW.assigned_producer_id
            AND agency_id = NEW.agency_id
        ) THEN
          RAISE EXCEPTION
            'crm_leads cross-agency or missing producer reference: assigned_producer_id=% agency_id=%',
            NEW.assigned_producer_id,
            NEW.agency_id;
        END IF;
      END IF;

      IF NEW.lead_list_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM crm_lead_lists
          WHERE id = NEW.lead_list_id
            AND agency_id = NEW.agency_id
        ) THEN
          RAISE EXCEPTION
            'crm_leads cross-agency or missing lead list reference: lead_list_id=% agency_id=%',
            NEW.lead_list_id,
            NEW.agency_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS crm_lead_lists_validate_same_agency_trg ON crm_lead_lists;
    CREATE TRIGGER crm_lead_lists_validate_same_agency_trg
    BEFORE INSERT OR UPDATE ON crm_lead_lists
    FOR EACH ROW
    EXECUTE FUNCTION crm_lead_lists_validate_same_agency();

    DROP TRIGGER IF EXISTS crm_leads_validate_same_agency_trg ON crm_leads;
    CREATE TRIGGER crm_leads_validate_same_agency_trg
    BEFORE INSERT OR UPDATE ON crm_leads
    FOR EACH ROW
    EXECUTE FUNCTION crm_leads_validate_same_agency();

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'crm_deals_lead_id_fkey'
      ) THEN
        ALTER TABLE crm_deals
        ADD CONSTRAINT crm_deals_lead_id_fkey
        FOREIGN KEY (lead_id) REFERENCES crm_leads(id);
      END IF;
    END;
    $$;

    CREATE INDEX IF NOT EXISTS crm_deals_agency_lead_idx
      ON crm_deals (agency_id, lead_id);

    CREATE OR REPLACE FUNCTION crm_deals_validate_same_agency()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      pipeline_exists BOOLEAN;
    BEGIN
      SELECT EXISTS (
        SELECT 1
        FROM crm_pipelines
        WHERE id = NEW.pipeline_id
          AND agency_id = NEW.agency_id
      ) INTO pipeline_exists;

      IF pipeline_exists IS NOT TRUE THEN
        RAISE EXCEPTION
          'crm_deals cross-agency or missing pipeline reference: pipeline_id=% agency_id=%',
          NEW.pipeline_id,
          NEW.agency_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM crm_pipeline_stages
        WHERE id = NEW.pipeline_stage_id
          AND pipeline_id = NEW.pipeline_id
          AND agency_id = NEW.agency_id
      ) THEN
        RAISE EXCEPTION
          'crm_deals cross-agency or invalid stage reference: pipeline_stage_id=% pipeline_id=% agency_id=%',
          NEW.pipeline_stage_id,
          NEW.pipeline_id,
          NEW.agency_id;
      END IF;

      IF NEW.account_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM accounts
          WHERE id = NEW.account_id
            AND agency_id = NEW.agency_id
        ) THEN
          RAISE EXCEPTION
            'crm_deals cross-agency or missing account reference: account_id=% agency_id=%',
            NEW.account_id,
            NEW.agency_id;
        END IF;
      END IF;

      IF NEW.lead_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM crm_leads
          WHERE id = NEW.lead_id
            AND agency_id = NEW.agency_id
        ) THEN
          RAISE EXCEPTION
            'crm_deals cross-agency or missing lead reference: lead_id=% agency_id=%',
            NEW.lead_id,
            NEW.agency_id;
        END IF;
      END IF;

      IF NEW.producer_user_id IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1
          FROM users
          WHERE id = NEW.producer_user_id
            AND agency_id = NEW.agency_id
        ) THEN
          RAISE EXCEPTION
            'crm_deals cross-agency or missing producer reference: producer_user_id=% agency_id=%',
            NEW.producer_user_id,
            NEW.agency_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$;
  `);
};

export const down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS crm_leads_validate_same_agency_trg ON crm_leads;
    DROP TRIGGER IF EXISTS crm_lead_lists_validate_same_agency_trg ON crm_lead_lists;
    DROP FUNCTION IF EXISTS crm_leads_validate_same_agency();
    DROP FUNCTION IF EXISTS crm_lead_lists_validate_same_agency();
    DROP TRIGGER IF EXISTS crm_leads_set_updated_at ON crm_leads;
    DROP TRIGGER IF EXISTS crm_lead_lists_set_updated_at ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_leads_delete_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_leads_update_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_leads_insert_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_leads_select_policy ON crm_leads;
    DROP POLICY IF EXISTS crm_lead_lists_delete_policy ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_lead_lists_update_policy ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_lead_lists_insert_policy ON crm_lead_lists;
    DROP POLICY IF EXISTS crm_lead_lists_select_policy ON crm_lead_lists;
    ALTER TABLE crm_deals DROP CONSTRAINT IF EXISTS crm_deals_lead_id_fkey;
    DROP TABLE IF EXISTS crm_leads;
    DROP TABLE IF EXISTS crm_lead_lists;
  `);
};
