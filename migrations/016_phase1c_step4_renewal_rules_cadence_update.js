exports.up = (pgm) => {
  pgm.sql(`
    -- 1) Target cadence + expected priority
    CREATE TEMP TABLE _renewal_target_days (
      days_before_expiration INT PRIMARY KEY,
      expected_priority TEXT NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO _renewal_target_days (days_before_expiration, expected_priority)
    VALUES
      (120, 'low'),
      (90,  'low'),
      (60,  'normal'),
      (30,  'normal'),
      (14,  'high'),
      (7,   'high'),
      (1,   'high')
    ON CONFLICT (days_before_expiration) DO UPDATE
      SET expected_priority = EXCLUDED.expected_priority;

    -- 2) Determine agencies in-scope (supports optional agencies.deleted_at)
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
    END $$;

    -- 3) Normalize priorities (remove any legacy values safely)
    -- If old data had "medium"/"urgent"/etc, collapse into low/normal/high.
    UPDATE renewal_rules
    SET case_priority = CASE
      WHEN case_priority = 'low' THEN 'low'
      WHEN case_priority = 'normal' THEN 'normal'
      WHEN case_priority = 'high' THEN 'high'
      WHEN case_priority = 'medium' THEN 'normal'
      WHEN case_priority = 'urgent' THEN 'high'
      ELSE 'high'
    END
    WHERE case_priority IS DISTINCT FROM CASE
      WHEN case_priority = 'low' THEN 'low'
      WHEN case_priority = 'normal' THEN 'normal'
      WHEN case_priority = 'high' THEN 'high'
      WHEN case_priority = 'medium' THEN 'normal'
      WHEN case_priority = 'urgent' THEN 'high'
      ELSE 'high'
    END;

    -- 4) Tighten check constraint to only allow low/normal/high
    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high'));

    -- 5) Soft-delete duplicates for target days, per agency (keep best row)
    WITH dupes AS (
      SELECT id
      FROM (
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
      ) x
      WHERE x.keep_rank > 1
    )
    UPDATE renewal_rules rr
    SET deleted_at = now()
    FROM dupes d
    WHERE rr.id = d.id
      AND rr.deleted_at IS NULL;

    -- 6) Update remaining active target rules to the correct settings
    UPDATE renewal_rules rr
    SET
      is_enabled = true,
      create_case = true,
      case_priority = td.expected_priority
    FROM _renewal_target_days td
    JOIN _renewal_target_agencies ta
      ON ta.id = rr.agency_id
    WHERE rr.days_before_expiration = td.days_before_expiration
      AND rr.deleted_at IS NULL
      AND (
        rr.is_enabled IS DISTINCT FROM true
        OR rr.create_case IS DISTINCT FROM true
        OR rr.case_priority IS DISTINCT FROM td.expected_priority
      );

    -- 7) Insert missing target rules per agency
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
      NULL::uuid AS assign_to,
      '{}'::jsonb AS metadata
    FROM _renewal_target_agencies ta
    CROSS JOIN _renewal_target_days td
    LEFT JOIN renewal_rules rr
      ON rr.agency_id = ta.id
     AND rr.days_before_expiration = td.days_before_expiration
     AND rr.deleted_at IS NULL
    WHERE rr.id IS NULL;

    -- 8) Enforce uniqueness going forward (only for active rules)
    DROP INDEX IF EXISTS renewal_rules_agency_day_active_uidx;

    CREATE UNIQUE INDEX renewal_rules_agency_day_active_uidx
      ON renewal_rules (agency_id, days_before_expiration)
      WHERE deleted_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- revert constraint to be permissive if you want, but safest is:
    ALTER TABLE renewal_rules
      DROP CONSTRAINT IF EXISTS renewal_rules_case_priority_check;

    -- allow legacy values again on down (optional)
    ALTER TABLE renewal_rules
      ADD CONSTRAINT renewal_rules_case_priority_check
      CHECK (case_priority IN ('low', 'normal', 'high', 'medium', 'urgent'));

    DROP INDEX IF EXISTS renewal_rules_agency_day_active_uidx;
  `);
};