exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE contacts
      ALTER COLUMN first_name DROP NOT NULL,
      ALTER COLUMN last_name DROP NOT NULL;

    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'person',
      ADD COLUMN IF NOT EXISTS business_name TEXT,
      ADD COLUMN IF NOT EXISTS address JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[],
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS updated_by UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    ALTER TABLE contacts
      DROP COLUMN IF EXISTS account_id,
      DROP COLUMN IF EXISTS preferred_contact_method,
      DROP COLUMN IF EXISTS timezone,
      DROP COLUMN IF EXISTS email_consent_status,
      DROP COLUMN IF EXISTS sms_consent_status,
      DROP COLUMN IF EXISTS do_not_contact,
      DROP COLUMN IF EXISTS source;

    ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_contact_type_check,
      DROP CONSTRAINT IF EXISTS contacts_status_check,
      DROP CONSTRAINT IF EXISTS contacts_name_business_requirements_check;

    ALTER TABLE contacts
      ADD CONSTRAINT contacts_contact_type_check
      CHECK (contact_type IN ('person', 'business'));

    ALTER TABLE contacts
      ADD CONSTRAINT contacts_status_check
      CHECK (status IN ('active', 'inactive'));

    ALTER TABLE contacts
      ADD CONSTRAINT contacts_name_business_requirements_check
      CHECK (
        (
          contact_type = 'person'
          AND (
            nullif(btrim(coalesce(first_name, '')), '') IS NOT NULL
            OR nullif(btrim(coalesce(last_name, '')), '') IS NOT NULL
          )
        )
        OR
        (
          contact_type = 'business'
          AND nullif(btrim(coalesce(business_name, '')), '') IS NOT NULL
        )
      );

    DROP INDEX IF EXISTS contacts_agency_account_idx;
    DROP INDEX IF EXISTS contacts_agency_email_idx;

    CREATE INDEX IF NOT EXISTS contacts_agency_email_active_idx
      ON contacts (agency_id, lower(email))
      WHERE email IS NOT NULL AND deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS contacts_agency_person_name_idx
      ON contacts (agency_id, lower(last_name), lower(first_name))
      WHERE contact_type = 'person' AND deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS contacts_agency_business_name_idx
      ON contacts (agency_id, lower(business_name))
      WHERE contact_type = 'business' AND deleted_at IS NULL;

    DROP POLICY IF EXISTS contacts_select_policy ON contacts;
    DROP POLICY IF EXISTS contacts_insert_policy ON contacts;
    DROP POLICY IF EXISTS contacts_update_policy ON contacts;
    DROP POLICY IF EXISTS contacts_delete_policy ON contacts;

    ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

    CREATE POLICY contacts_select_policy
    ON contacts
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY contacts_insert_policy
    ON contacts
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY contacts_update_policy
    ON contacts
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY contacts_delete_policy
    ON contacts
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS contacts_delete_policy ON contacts;
    DROP POLICY IF EXISTS contacts_update_policy ON contacts;
    DROP POLICY IF EXISTS contacts_insert_policy ON contacts;
    DROP POLICY IF EXISTS contacts_select_policy ON contacts;

    CREATE POLICY contacts_select_policy
    ON contacts
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY contacts_insert_policy
    ON contacts
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY contacts_update_policy
    ON contacts
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY contacts_delete_policy
    ON contacts
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP INDEX IF EXISTS contacts_agency_business_name_idx;
    DROP INDEX IF EXISTS contacts_agency_person_name_idx;
    DROP INDEX IF EXISTS contacts_agency_email_active_idx;

    CREATE INDEX IF NOT EXISTS contacts_agency_account_idx ON contacts (agency_id, account_id);
    CREATE INDEX IF NOT EXISTS contacts_agency_email_idx ON contacts (agency_id, email);

    ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_name_business_requirements_check,
      DROP CONSTRAINT IF EXISTS contacts_status_check,
      DROP CONSTRAINT IF EXISTS contacts_contact_type_check;

    ALTER TABLE contacts
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS tags,
      DROP COLUMN IF EXISTS address,
      DROP COLUMN IF EXISTS business_name,
      DROP COLUMN IF EXISTS contact_type;

    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id),
      ADD COLUMN IF NOT EXISTS preferred_contact_method preferred_contact_method,
      ADD COLUMN IF NOT EXISTS timezone TEXT,
      ADD COLUMN IF NOT EXISTS email_consent_status consent_status,
      ADD COLUMN IF NOT EXISTS sms_consent_status sms_consent_status,
      ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS source contact_source;

    ALTER TABLE contacts
      ALTER COLUMN first_name SET NOT NULL,
      ALTER COLUMN last_name SET NOT NULL;
  `);
};
