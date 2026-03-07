exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS account_id UUID,
      ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT,
      ADD COLUMN IF NOT EXISTS timezone TEXT,
      ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS source TEXT;

    ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_account_id_fkey,
      DROP CONSTRAINT IF EXISTS contacts_preferred_contact_method_check,
      DROP CONSTRAINT IF EXISTS contacts_source_check;

    ALTER TABLE contacts
      ADD CONSTRAINT contacts_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      ADD CONSTRAINT contacts_preferred_contact_method_check
      CHECK (
        preferred_contact_method IS NULL
        OR preferred_contact_method IN ('email', 'phone', 'text')
      ),
      ADD CONSTRAINT contacts_source_check
      CHECK (
        source IS NULL
        OR source IN ('referral', 'import', 'website', 'manual', 'other')
      );

    CREATE INDEX IF NOT EXISTS contacts_agency_account_active_idx
      ON contacts (agency_id, account_id)
      WHERE deleted_at IS NULL;

    CREATE OR REPLACE FUNCTION contacts_validate_account_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      account_exists BOOLEAN;
    BEGIN
      IF NEW.account_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM accounts
        WHERE id = NEW.account_id
          AND agency_id = NEW.agency_id
      ) INTO account_exists;

      IF NOT account_exists THEN
        RAISE EXCEPTION
          'contacts cross-agency or missing account reference: account_id=% agency_id=%',
          NEW.account_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS contacts_validate_account_same_agency_trg ON contacts;
    CREATE TRIGGER contacts_validate_account_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, account_id
    ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION contacts_validate_account_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS contacts_validate_account_same_agency_trg ON contacts;
    DROP FUNCTION IF EXISTS contacts_validate_account_same_agency();

    DROP INDEX IF EXISTS contacts_agency_account_active_idx;

    ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_source_check,
      DROP CONSTRAINT IF EXISTS contacts_preferred_contact_method_check,
      DROP CONSTRAINT IF EXISTS contacts_account_id_fkey;

    ALTER TABLE contacts
      DROP COLUMN IF EXISTS account_id,
      DROP COLUMN IF EXISTS preferred_contact_method,
      DROP COLUMN IF EXISTS timezone,
      DROP COLUMN IF EXISTS do_not_contact,
      DROP COLUMN IF EXISTS source;
  `);
};
