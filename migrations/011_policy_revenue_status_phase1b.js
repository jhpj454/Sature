exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE policies
      ADD COLUMN IF NOT EXISTS revenue_status TEXT NOT NULL DEFAULT 'balanced';

    ALTER TABLE policies
      DROP CONSTRAINT IF EXISTS policies_revenue_status_check;

    ALTER TABLE policies
      ADD CONSTRAINT policies_revenue_status_check
      CHECK (revenue_status IN ('under_collected', 'balanced', 'over_collected'));

    UPDATE policies
    SET revenue_status = CASE
      WHEN COALESCE(commission_received, 0) = COALESCE(commission_expected, 0) THEN 'balanced'
      WHEN COALESCE(commission_received, 0) < COALESCE(commission_expected, 0) THEN 'under_collected'
      ELSE 'over_collected'
    END;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE policies
      DROP CONSTRAINT IF EXISTS policies_revenue_status_check;

    ALTER TABLE policies
      DROP COLUMN IF EXISTS revenue_status;
  `);
};
