exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS external_ref TEXT,
      ADD COLUMN IF NOT EXISTS marketing_status TEXT NOT NULL DEFAULT 'unknown';

    ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_marketing_status_check;

    ALTER TABLE contacts
      ADD CONSTRAINT contacts_marketing_status_check
      CHECK (marketing_status IN ('unknown', 'subscribed', 'unsubscribed', 'bounced'));

    CREATE INDEX IF NOT EXISTS contacts_agency_external_ref_idx
      ON contacts (agency_id, external_ref);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS contacts_agency_external_ref_idx;

    ALTER TABLE contacts
      DROP CONSTRAINT IF EXISTS contacts_marketing_status_check;

    ALTER TABLE contacts
      DROP COLUMN IF EXISTS marketing_status,
      DROP COLUMN IF EXISTS external_ref;
  `);
};
