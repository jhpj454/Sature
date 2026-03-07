exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE activities
      ALTER COLUMN activity_type TYPE TEXT USING activity_type::TEXT;

    UPDATE activities
    SET activity_type = CASE
      WHEN activity_type = 'meeting' THEN 'note'
      ELSE activity_type
    END;

    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS summary TEXT,
      ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS updated_by UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE activities
    SET
      summary = COALESCE(summary, content, 'Activity'),
      occurred_at = COALESCE(occurred_at, created_at),
      created_by = COALESCE(created_by, created_by_user_id),
      updated_by = COALESCE(updated_by, created_by_user_id),
      entity_id = COALESCE(entity_id, gen_random_uuid()),
      entity_type = CASE
        WHEN entity_type IN ('policy','service_case','document','contact','policy_transaction','carrier') THEN entity_type
        ELSE 'policy'
      END,
      activity_type = CASE
        WHEN activity_type IN ('note','email','call','task','system','status_change','document_added') THEN activity_type
        ELSE 'system'
      END;

    ALTER TABLE activities
      ALTER COLUMN summary SET NOT NULL,
      ALTER COLUMN entity_id SET NOT NULL;

    ALTER TABLE activities
      DROP COLUMN IF EXISTS content,
      DROP COLUMN IF EXISTS created_by_user_id;

    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_entity_type_check,
      DROP CONSTRAINT IF EXISTS activities_activity_type_check;

    ALTER TABLE activities
      ADD CONSTRAINT activities_entity_type_check
      CHECK (entity_type IN ('policy','service_case','document','contact','policy_transaction','carrier')),
      ADD CONSTRAINT activities_activity_type_check
      CHECK (activity_type IN ('note','email','call','task','system','status_change','document_added'));

    DROP INDEX IF EXISTS activities_agency_entity_occurred_at_idx;
    DROP INDEX IF EXISTS activities_agency_occurred_at_idx;

    CREATE INDEX IF NOT EXISTS activities_agency_entity_occurred_at_idx
      ON activities (agency_id, entity_type, entity_id, occurred_at DESC);

    CREATE INDEX IF NOT EXISTS activities_agency_occurred_at_idx
      ON activities (agency_id, occurred_at DESC);

    DROP POLICY IF EXISTS activities_select_policy ON activities;
    DROP POLICY IF EXISTS activities_insert_policy ON activities;
    DROP POLICY IF EXISTS activities_update_policy ON activities;
    DROP POLICY IF EXISTS activities_delete_policy ON activities;

    ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
    ALTER TABLE activities FORCE ROW LEVEL SECURITY;

    CREATE POLICY activities_select_policy
    ON activities
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY activities_insert_policy
    ON activities
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY activities_update_policy
    ON activities
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY activities_delete_policy
    ON activities
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS activities_delete_policy ON activities;
    DROP POLICY IF EXISTS activities_update_policy ON activities;
    DROP POLICY IF EXISTS activities_insert_policy ON activities;
    DROP POLICY IF EXISTS activities_select_policy ON activities;

    CREATE POLICY activities_select_policy
    ON activities
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY activities_insert_policy
    ON activities
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY activities_update_policy
    ON activities
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY activities_delete_policy
    ON activities
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP INDEX IF EXISTS activities_agency_occurred_at_idx;
    DROP INDEX IF EXISTS activities_agency_entity_occurred_at_idx;

    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_entity_type_check,
      DROP CONSTRAINT IF EXISTS activities_activity_type_check;

    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS content TEXT,
      ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

    UPDATE activities
    SET
      content = COALESCE(content, summary),
      created_by_user_id = COALESCE(created_by_user_id, created_by),
      activity_type = CASE
        WHEN activity_type IN ('note','call','email','system') THEN activity_type
        WHEN activity_type IN ('task','status_change','document_added') THEN 'system'
        ELSE 'note'
      END;

    ALTER TABLE activities
      ALTER COLUMN activity_type TYPE activity_type USING activity_type::activity_type,
      ALTER COLUMN entity_id DROP NOT NULL;

    ALTER TABLE activities
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS details,
      DROP COLUMN IF EXISTS summary,
      DROP COLUMN IF EXISTS occurred_at;
  `);
};
