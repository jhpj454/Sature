exports.up = (pgm) => {
  pgm.sql(`
    -- ─────────────────────────────────────────────────────────────────────
    -- 1. Update validate_entity_reference_same_agency to handle all
    --    entity types that appear in activities.entity_type_check, plus
    --    the new 'general' type used by standalone calendar events.
    -- ─────────────────────────────────────────────────────────────────────
    CREATE OR REPLACE FUNCTION public.validate_entity_reference_same_agency(
      p_entity_type text,
      p_entity_id   uuid,
      p_agency_id   uuid,
      p_context     text
    )
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
      ref_exists BOOLEAN;
    BEGIN
      IF p_entity_type = 'general' THEN
        -- Standalone calendar events – no foreign entity to validate.
        RETURN;
      ELSIF p_entity_type = 'policy' THEN
        SELECT EXISTS(
          SELECT 1 FROM policies WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type IN ('service_case', 'case') THEN
        SELECT EXISTS(
          SELECT 1 FROM service_cases WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'contact' THEN
        SELECT EXISTS(
          SELECT 1 FROM contacts WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'policy_transaction' THEN
        SELECT EXISTS(
          SELECT 1 FROM policy_transactions WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'carrier' THEN
        SELECT EXISTS(
          SELECT 1 FROM carriers WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'document' THEN
        SELECT EXISTS(
          SELECT 1 FROM documents WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'account' THEN
        SELECT EXISTS(
          SELECT 1 FROM accounts WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'deal' THEN
        SELECT EXISTS(
          SELECT 1 FROM crm_deals WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'lead' THEN
        SELECT EXISTS(
          SELECT 1 FROM crm_leads WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSE
        RAISE EXCEPTION '% has unsupported entity_type: %', p_context, p_entity_type;
      END IF;

      IF NOT ref_exists THEN
        RAISE EXCEPTION
          '% cross-agency or missing entity reference: type=% id=% agency_id=%',
          p_context,
          p_entity_type,
          p_entity_id,
          p_agency_id;
      END IF;
    END;
    $$;

    -- ─────────────────────────────────────────────────────────────────────
    -- 2. Update activities entity_type constraint to include 'general'
    -- ─────────────────────────────────────────────────────────────────────
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
          'lead',
          'general'
        ]));

    -- ─────────────────────────────────────────────────────────────────────
    -- 3. Extend activities with calendar columns (add only if missing)
    -- ─────────────────────────────────────────────────────────────────────
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS end_at             TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS all_day            BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS location           TEXT,
      ADD COLUMN IF NOT EXISTS category           TEXT,
      ADD COLUMN IF NOT EXISTS recurrence_rule    TEXT,
      ADD COLUMN IF NOT EXISTS parent_activity_id UUID REFERENCES activities(id);

    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_category_check;

    ALTER TABLE activities
      ADD CONSTRAINT activities_category_check
        CHECK (category IS NULL OR category = ANY (ARRAY[
          'meeting','call','personal','renewal','task','other'
        ]));

    CREATE INDEX IF NOT EXISTS activities_agency_category_idx
      ON activities (agency_id, category)
      WHERE deleted_at IS NULL AND category IS NOT NULL;

    CREATE INDEX IF NOT EXISTS activities_parent_activity_id_idx
      ON activities (parent_activity_id)
      WHERE parent_activity_id IS NOT NULL;

    -- ─────────────────────────────────────────────────────────────────────
    -- 4. task_templates
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS task_templates (
      id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id             UUID        NOT NULL REFERENCES agencies(id),
      name                  TEXT        NOT NULL,
      description           TEXT,
      default_offset_days   INTEGER,
      default_assignee_role TEXT
                            CHECK (default_assignee_role IN
                                   ('producer','csr','marketing','admin')),
      created_by            UUID        NOT NULL REFERENCES users(id),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at            TIMESTAMPTZ
    );

    ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_templates FORCE ROW LEVEL SECURITY;

    CREATE POLICY task_templates_select_policy ON task_templates
      FOR SELECT
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_templates_insert_policy ON task_templates
      FOR INSERT
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_templates_update_policy ON task_templates
      FOR UPDATE
      USING  (agency_id = current_setting('app.current_agency_id', true)::uuid)
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_templates_delete_policy ON task_templates
      FOR DELETE
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE INDEX IF NOT EXISTS task_templates_agency_active_idx
      ON task_templates (agency_id)
      WHERE deleted_at IS NULL;

    CREATE OR REPLACE FUNCTION set_task_templates_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

    DROP TRIGGER IF EXISTS task_templates_set_updated_at ON task_templates;
    CREATE TRIGGER task_templates_set_updated_at
      BEFORE UPDATE ON task_templates
      FOR EACH ROW EXECUTE FUNCTION set_task_templates_updated_at();

    -- ─────────────────────────────────────────────────────────────────────
    -- 5. task_automation_rules
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS task_automation_rules (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id         UUID        NOT NULL REFERENCES agencies(id),
      name              TEXT        NOT NULL,
      template_id       UUID        NOT NULL REFERENCES task_templates(id),
      trigger_type      TEXT        NOT NULL
                        CHECK (trigger_type IN (
                          'policy_expiration',
                          'account_created',
                          'deal_won',
                          'deal_stage_changed',
                          'recurring_schedule'
                        )),
      trigger_offset_days INTEGER,
      segment_filters   JSONB       NOT NULL DEFAULT '{}'::jsonb,
      recurrence_rule   TEXT,
      is_active         BOOLEAN     NOT NULL DEFAULT true,
      last_run_at       TIMESTAMPTZ,
      created_by        UUID        NOT NULL REFERENCES users(id),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at        TIMESTAMPTZ
    );

    ALTER TABLE task_automation_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_automation_rules FORCE ROW LEVEL SECURITY;

    CREATE POLICY task_automation_rules_select_policy ON task_automation_rules
      FOR SELECT
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_automation_rules_insert_policy ON task_automation_rules
      FOR INSERT
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_automation_rules_update_policy ON task_automation_rules
      FOR UPDATE
      USING  (agency_id = current_setting('app.current_agency_id', true)::uuid)
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_automation_rules_delete_policy ON task_automation_rules
      FOR DELETE
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE INDEX IF NOT EXISTS task_automation_rules_agency_active_idx
      ON task_automation_rules (agency_id, is_active)
      WHERE deleted_at IS NULL;

    CREATE OR REPLACE FUNCTION set_task_automation_rules_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

    DROP TRIGGER IF EXISTS task_automation_rules_set_updated_at ON task_automation_rules;
    CREATE TRIGGER task_automation_rules_set_updated_at
      BEFORE UPDATE ON task_automation_rules
      FOR EACH ROW EXECUTE FUNCTION set_task_automation_rules_updated_at();

    -- ─────────────────────────────────────────────────────────────────────
    -- 6. task_rule_executions (de-duplication ledger)
    -- ─────────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS task_rule_executions (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id      UUID        NOT NULL REFERENCES agencies(id),
      rule_id        UUID        NOT NULL REFERENCES task_automation_rules(id),
      entity_type    TEXT        NOT NULL,
      entity_id      UUID        NOT NULL,
      task_id        UUID        REFERENCES tasks(id),
      executed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_date DATE        NOT NULL DEFAULT CURRENT_DATE
    );

    ALTER TABLE task_rule_executions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE task_rule_executions FORCE ROW LEVEL SECURITY;

    CREATE POLICY task_rule_executions_select_policy ON task_rule_executions
      FOR SELECT
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_rule_executions_insert_policy ON task_rule_executions
      FOR INSERT
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_rule_executions_update_policy ON task_rule_executions
      FOR UPDATE
      USING  (agency_id = current_setting('app.current_agency_id', true)::uuid)
      WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY task_rule_executions_delete_policy ON task_rule_executions
      FOR DELETE
      USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    -- Unique index to prevent same-day duplicates per rule+entity
    CREATE UNIQUE INDEX IF NOT EXISTS task_rule_executions_dedup_idx
      ON task_rule_executions (rule_id, entity_type, entity_id, execution_date);

    CREATE INDEX IF NOT EXISTS task_rule_executions_rule_entity_idx
      ON task_rule_executions (rule_id, entity_type, entity_id);

    -- ─────────────────────────────────────────────────────────────────────
    -- 7. Extend tasks with rules engine columns
    -- ─────────────────────────────────────────────────────────────────────
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS template_id     UUID REFERENCES task_templates(id),
      ADD COLUMN IF NOT EXISTS rule_id         UUID REFERENCES task_automation_rules(id),
      ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
      ADD COLUMN IF NOT EXISTS parent_task_id  UUID REFERENCES tasks(id);

    CREATE INDEX IF NOT EXISTS tasks_rule_id_idx      ON tasks (rule_id)      WHERE rule_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS tasks_template_id_idx  ON tasks (template_id)  WHERE template_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS tasks_parent_task_id_idx ON tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Reverse tasks extensions
    ALTER TABLE tasks
      DROP COLUMN IF EXISTS parent_task_id,
      DROP COLUMN IF EXISTS recurrence_rule,
      DROP COLUMN IF EXISTS rule_id,
      DROP COLUMN IF EXISTS template_id;

    -- Drop task_rule_executions
    DROP TABLE IF EXISTS task_rule_executions;

    -- Drop task_automation_rules
    DROP TABLE IF EXISTS task_automation_rules;

    -- Drop task_templates
    DROP TABLE IF EXISTS task_templates;

    -- Reverse activities calendar columns
    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_category_check,
      DROP COLUMN IF EXISTS parent_activity_id,
      DROP COLUMN IF EXISTS recurrence_rule,
      DROP COLUMN IF EXISTS category,
      DROP COLUMN IF EXISTS location,
      DROP COLUMN IF EXISTS all_day,
      DROP COLUMN IF EXISTS end_at;

    -- Restore original entity_type constraint
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

    -- Restore original validate function (without general/account/deal/lead)
    CREATE OR REPLACE FUNCTION public.validate_entity_reference_same_agency(
      p_entity_type text,
      p_entity_id   uuid,
      p_agency_id   uuid,
      p_context     text
    )
    RETURNS void
    LANGUAGE plpgsql
    AS $$
    DECLARE
      ref_exists BOOLEAN;
    BEGIN
      IF p_entity_type = 'policy' THEN
        SELECT EXISTS(
          SELECT 1 FROM policies WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'service_case' THEN
        SELECT EXISTS(
          SELECT 1 FROM service_cases WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'contact' THEN
        SELECT EXISTS(
          SELECT 1 FROM contacts WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'policy_transaction' THEN
        SELECT EXISTS(
          SELECT 1 FROM policy_transactions WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'carrier' THEN
        SELECT EXISTS(
          SELECT 1 FROM carriers WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSIF p_entity_type = 'document' THEN
        SELECT EXISTS(
          SELECT 1 FROM documents WHERE id = p_entity_id AND agency_id = p_agency_id
        ) INTO ref_exists;
      ELSE
        RAISE EXCEPTION '% has unsupported entity_type: %', p_context, p_entity_type;
      END IF;

      IF NOT ref_exists THEN
        RAISE EXCEPTION
          '% cross-agency or missing entity reference: type=% id=% agency_id=%',
          p_context,
          p_entity_type,
          p_entity_id,
          p_agency_id;
      END IF;
    END;
    $$;
  `);
};
