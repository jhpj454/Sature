exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_activity_type_check;

    ALTER TABLE activities
      ADD CONSTRAINT activities_activity_type_check
      CHECK (
        activity_type IN (
          'note',
          'email',
          'call',
          'meeting',
          'task',
          'system',
          'status_change',
          'document_added'
        )
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_activity_type_check;

    ALTER TABLE activities
      ADD CONSTRAINT activities_activity_type_check
      CHECK (
        activity_type IN (
          'note',
          'email',
          'call',
          'task',
          'system',
          'status_change',
          'document_added'
        )
      );
  `);
};
