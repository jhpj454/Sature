exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS tasks_agency_due_date_active_idx
      ON tasks (agency_id, due_date)
      WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS tasks_agency_due_date_active_idx;

    ALTER TABLE tasks
      DROP COLUMN IF EXISTS deleted_at;
  `);
};
