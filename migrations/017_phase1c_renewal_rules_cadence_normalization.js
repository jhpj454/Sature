exports.up = (pgm) => {
  pgm.sql(`
    CREATE TEMP TABLE _renewal_target_days (
      days_before_expiration INT PRIMARY KEY,
      expected_priority TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _renewal_target_days (days_before_expiration, expected_priority)
    VALUES
      (120, 'low'),
      (90, 'low'),
      (60, 'normal'),
      (30, 'normal'),
      (14, 'high'),
      (7, 'high'),
      (1, 'high')
    ON CONFLICT (days_before_expiration) DO UPDATE
      SET expected_priority = EXCLUDED.expected_priority;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'agencies'
          AND column_name = 'deleted_at'
      ) THEN
        EXECUTE '
          CREATE TEMP TABLE _renewal_target_agencies ON COMMIT DROP AS
          SELECT id
          FROM agencies
          WHERE deleted_at IS NULL
        ';
      ELSE
        EXECUTE '
          CREATE TEMP TABLE _renewal_target_agencies ON COMMIT DROP AS
          SELECT id
          FROM agencies
        ';
      END IF;
    END
    $$;

    -- AMS renewal ticklers are commonly configured as fixed day offsets from expiration.
    UPDATE renewal_rules
    SET case_priority = CASE
      WHEN case_priority = 'low' THEN 'low'
      WHEN case_priority = 'normal' THEN 'normal'
      ELSE 'high'
    END
    WHERE case_priority IS DISTINCT FROM CASE
      WHEN case_priority = 'low' THEN 'low'
      WHEN case_priority = 'normal' THEN 'normal'
      ELSE 'high'
    END;

    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high'));

    -- Keep one deterministic active rule per (agency, offset), prefer assigned + freshest row.
    WITH ranked AS (
      SELECT
        rr.id,
        ROW_NUMBER() OVER (
          PARTITION BY rr.agency_id, rr.days_before_expiration
          ORDER BY
            (rr.assign_to IS NOT NULL) DESC,
            rr.updated_at DESC NULLS LAST,
            rr.created_at DESC NULLS LAST,
            rr.id DESC
        ) AS keep_rank
      FROM renewal_rules rr
      JOIN _renewal_target_agencies ta
        ON ta.id = rr.agency_id
      JOIN _renewal_target_days td
        ON td.days_before_expiration = rr.days_before_expiration
      WHERE rr.deleted_at IS NULL
    )
    UPDATE renewal_rules rr
    SET deleted_at = now()
    FROM ranked r
    WHERE rr.id = r.id
      AND r.keep_rank > 1
      AND rr.deleted_at IS NULL;

    -- Build per-agency fallback assignee from most recently updated assigned active rule.
    CREATE TEMP TABLE _renewal_agency_best_assign_to ON COMMIT DROP AS
    SELECT DISTINCT ON (rr.agency_id)
      rr.agency_id,
      rr.assign_to
    FROM renewal_rules rr
    JOIN _renewal_target_agencies ta
      ON ta.id = rr.agency_id
    WHERE rr.deleted_at IS NULL
      AND rr.assign_to IS NOT NULL
    ORDER BY rr.agency_id, rr.updated_at DESC NULLS LAST, rr.created_at DESC NULLS LAST, rr.id DESC;

    UPDATE renewal_rules rr
    SET
      is_enabled = true,
      create_case = true,
      case_priority = td.expected_priority,
      assign_to = COALESCE(rr.assign_to, aba.assign_to)
    FROM _renewal_target_days td,
         _renewal_target_agencies ta
    LEFT JOIN _renewal_agency_best_assign_to aba
      ON aba.agency_id = ta.id
    WHERE ta.id = rr.agency_id
      AND rr.days_before_expiration = td.days_before_expiration
      AND rr.deleted_at IS NULL
      AND (
        rr.is_enabled IS DISTINCT FROM true
        OR rr.create_case IS DISTINCT FROM true
        OR rr.case_priority IS DISTINCT FROM td.expected_priority
        OR rr.assign_to IS NULL
      );

    -- Agency CRMs also use days-before-expiration automation windows; fill any missing offsets.
    INSERT INTO renewal_rules (
      agency_id,
      is_enabled,
      days_before_expiration,
      create_case,
      case_priority,
      assign_to,
      metadata
    )
    SELECT
      ta.id AS agency_id,
      true AS is_enabled,
      td.days_before_expiration,
      true AS create_case,
      td.expected_priority AS case_priority,
      aba.assign_to,
      '{}'::jsonb AS metadata
    FROM _renewal_target_agencies ta
    CROSS JOIN _renewal_target_days td
    LEFT JOIN renewal_rules rr
      ON rr.agency_id = ta.id
     AND rr.days_before_expiration = td.days_before_expiration
     AND rr.deleted_at IS NULL
    LEFT JOIN _renewal_agency_best_assign_to aba
      ON aba.agency_id = ta.id
    WHERE rr.id IS NULL;

    DROP INDEX IF EXISTS renewal_rules_agency_day_active_uidx;

    CREATE UNIQUE INDEX IF NOT EXISTS renewal_rules_agency_day_active_uidx
      ON renewal_rules (agency_id, days_before_expiration)
      WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS renewal_rules_agency_day_active_uidx;

    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high', 'medium', 'urgent'));
  `);
};

/*
Verification SQL:

-- A) Agency compliance summary
WITH target(days_before_expiration, expected_priority) AS (
  VALUES
    (120, 'low'),
    (90,  'low'),
    (60,  'normal'),
    (30,  'normal'),
    (14,  'high'),
    (7,   'high'),
    (1,   'high')
),
agencies_scope AS (
  SELECT a.id
  FROM agencies a
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'agencies'
      AND c.column_name = 'deleted_at'
  )
  UNION ALL
  SELECT a.id
  FROM agencies a
  WHERE EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'agencies'
      AND c.column_name = 'deleted_at'
  )
    AND a.deleted_at IS NULL
),
coverage AS (
  SELECT
    a.id AS agency_id,
    t.days_before_expiration,
    t.expected_priority,
    COUNT(rr.id) AS active_rule_count,
    COALESCE(BOOL_AND(rr.is_enabled), false) AS all_enabled,
    COALESCE(BOOL_AND(rr.create_case), false) AS all_create_case,
    COALESCE(BOOL_AND(rr.case_priority = t.expected_priority), false) AS priority_ok
  FROM agencies_scope a
  CROSS JOIN target t
  LEFT JOIN renewal_rules rr
    ON rr.agency_id = a.id
   AND rr.days_before_expiration = t.days_before_expiration
   AND rr.deleted_at IS NULL
  GROUP BY a.id, t.days_before_expiration, t.expected_priority
)
SELECT
  agency_id,
  COUNT(*) FILTER (
    WHERE active_rule_count = 1
      AND all_enabled
      AND all_create_case
      AND priority_ok
  ) AS correct_rules,
  7 AS required_rules,
  BOOL_AND(
    active_rule_count = 1
    AND all_enabled
    AND all_create_case
    AND priority_ok
  ) AS fully_compliant
FROM coverage
GROUP BY agency_id
ORDER BY agency_id;

-- B) Mismatch detail
WITH target(days_before_expiration, expected_priority) AS (
  VALUES
    (120, 'low'),
    (90,  'low'),
    (60,  'normal'),
    (30,  'normal'),
    (14,  'high'),
    (7,   'high'),
    (1,   'high')
),
agencies_scope AS (
  SELECT a.id
  FROM agencies a
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'agencies'
      AND c.column_name = 'deleted_at'
  )
  UNION ALL
  SELECT a.id
  FROM agencies a
  WHERE EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'agencies'
      AND c.column_name = 'deleted_at'
  )
    AND a.deleted_at IS NULL
)
SELECT
  a.id AS agency_id,
  t.days_before_expiration,
  t.expected_priority,
  COUNT(rr.id) AS active_rule_count,
  ARRAY_REMOVE(ARRAY_AGG(DISTINCT rr.case_priority), NULL) AS active_priorities,
  COALESCE(BOOL_AND(rr.is_enabled), false) AS all_enabled,
  COALESCE(BOOL_AND(rr.create_case), false) AS all_create_case
FROM agencies_scope a
CROSS JOIN target t
LEFT JOIN renewal_rules rr
  ON rr.agency_id = a.id
 AND rr.days_before_expiration = t.days_before_expiration
 AND rr.deleted_at IS NULL
GROUP BY a.id, t.days_before_expiration, t.expected_priority
HAVING NOT (
  COUNT(rr.id) = 1
  AND COALESCE(BOOL_AND(rr.is_enabled), false)
  AND COALESCE(BOOL_AND(rr.create_case), false)
  AND COALESCE(BOOL_AND(rr.case_priority = t.expected_priority), false)
)
ORDER BY agency_id, days_before_expiration DESC;

-- C) Distribution
SELECT days_before_expiration, case_priority, COUNT(*)
FROM renewal_rules
WHERE deleted_at IS NULL
GROUP BY 1,2
ORDER BY days_before_expiration DESC, case_priority;
*/
