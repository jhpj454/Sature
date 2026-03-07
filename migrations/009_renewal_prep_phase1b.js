exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE policies
      ADD COLUMN IF NOT EXISTS renewal_status TEXT NOT NULL DEFAULT 'not_started',
      ADD COLUMN IF NOT EXISTS renewal_assigned_to UUID,
      ADD COLUMN IF NOT EXISTS renewal_last_touch_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS renewal_next_action_at TIMESTAMPTZ;

    ALTER TABLE policies
      DROP CONSTRAINT IF EXISTS policies_renewal_status_check;

    ALTER TABLE policies
      ADD CONSTRAINT policies_renewal_status_check
      CHECK (renewal_status IN ('not_started', 'in_progress', 'quoted', 'bound', 'lost'));

    CREATE INDEX IF NOT EXISTS policies_agency_expiration_date_idx
      ON policies (agency_id, expiration_date);

    CREATE INDEX IF NOT EXISTS policies_agency_renewal_status_expiration_idx
      ON policies (agency_id, renewal_status, expiration_date);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS policies_agency_renewal_status_expiration_idx;
    DROP INDEX IF EXISTS policies_agency_expiration_date_idx;

    ALTER TABLE policies
      DROP CONSTRAINT IF EXISTS policies_renewal_status_check;

    ALTER TABLE policies
      DROP COLUMN IF EXISTS renewal_next_action_at,
      DROP COLUMN IF EXISTS renewal_last_touch_at,
      DROP COLUMN IF EXISTS renewal_assigned_to,
      DROP COLUMN IF EXISTS renewal_status;
  `);
};
