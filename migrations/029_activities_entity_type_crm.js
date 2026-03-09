exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_entity_type_check;

    ALTER TABLE activities
      ADD CONSTRAINT activities_entity_type_check
        CHECK (entity_type = ANY (ARRAY[
          'policy',
          'service_case',
          'document',
          'contact',
          'policy_transaction',
          'carrier',
          'account',
          'case',
          'deal',
          'lead'
        ]));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_entity_type_check;

    ALTER TABLE activities
      ADD CONSTRAINT activities_entity_type_check
        CHECK (entity_type = ANY (ARRAY[
          'policy',
          'service_case',
          'document',
          'contact',
          'policy_transaction',
          'carrier'
        ]));
  `);
};
