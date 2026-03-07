exports.up = (pgm) => {
  pgm.sql(`
    UPDATE renewal_rules
    SET case_priority = CASE
      WHEN case_priority = 'medium' THEN 'normal'
      WHEN case_priority IN ('low', 'normal', 'high', 'urgent') THEN case_priority
      ELSE 'high'
    END
    WHERE case_priority IS DISTINCT FROM CASE
      WHEN case_priority = 'medium' THEN 'normal'
      WHEN case_priority IN ('low', 'normal', 'high', 'urgent') THEN case_priority
      ELSE 'high'
    END;

    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high', 'urgent'));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high', 'medium', 'urgent'));
  `);
};
