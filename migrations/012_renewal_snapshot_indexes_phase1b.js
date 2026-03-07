exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS service_cases_agency_policy_status_idx
      ON service_cases (agency_id, policy_id, status);

    CREATE INDEX IF NOT EXISTS contact_roles_policy_primary_insured_idx
      ON contact_roles (agency_id, entity_type, entity_id, role, is_primary, created_at DESC)
      WHERE deleted_at IS NULL;

    CREATE INDEX IF NOT EXISTS policy_transactions_policy_latest_idx
      ON policy_transactions (agency_id, policy_id, transaction_date DESC, created_at DESC)
      WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS policy_transactions_policy_latest_idx;
    DROP INDEX IF EXISTS contact_roles_policy_primary_insured_idx;
    DROP INDEX IF EXISTS service_cases_agency_policy_status_idx;
  `);
};
