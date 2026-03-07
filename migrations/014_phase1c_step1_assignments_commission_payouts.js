exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE policies
      ADD COLUMN IF NOT EXISTS producer_id UUID,
      ADD COLUMN IF NOT EXISTS csr_id UUID;

    ALTER TABLE policies
      DROP CONSTRAINT IF EXISTS policies_producer_id_fkey,
      DROP CONSTRAINT IF EXISTS policies_csr_id_fkey;

    ALTER TABLE policies
      ADD CONSTRAINT policies_producer_id_fkey
      FOREIGN KEY (producer_id) REFERENCES users(id),
      ADD CONSTRAINT policies_csr_id_fkey
      FOREIGN KEY (csr_id) REFERENCES users(id);

    CREATE INDEX IF NOT EXISTS policies_agency_producer_idx
      ON policies (agency_id, producer_id);

    CREATE INDEX IF NOT EXISTS policies_agency_csr_idx
      ON policies (agency_id, csr_id);

    CREATE TABLE IF NOT EXISTS commission_splits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      effective_date DATE NOT NULL,
      producer_id UUID NOT NULL REFERENCES users(id),
      split_percent NUMERIC(7,4),
      split_flat NUMERIC(12,2),
      status TEXT NOT NULL DEFAULT 'active',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      deleted_at TIMESTAMPTZ
    );

    ALTER TABLE commission_splits
      DROP CONSTRAINT IF EXISTS commission_splits_split_percent_check,
      DROP CONSTRAINT IF EXISTS commission_splits_status_check,
      DROP CONSTRAINT IF EXISTS commission_splits_amount_presence_check;

    ALTER TABLE commission_splits
      ADD CONSTRAINT commission_splits_split_percent_check
      CHECK (split_percent IS NULL OR (split_percent >= 0 AND split_percent <= 1)),
      ADD CONSTRAINT commission_splits_status_check
      CHECK (status IN ('active', 'inactive')),
      ADD CONSTRAINT commission_splits_amount_presence_check
      CHECK (
        COALESCE(split_percent, 0) > 0
        OR COALESCE(split_flat, 0) <> 0
      );

    CREATE INDEX IF NOT EXISTS commission_splits_agency_policy_idx
      ON commission_splits (agency_id, policy_id);

    CREATE INDEX IF NOT EXISTS commission_splits_agency_producer_idx
      ON commission_splits (agency_id, producer_id);

    CREATE TABLE IF NOT EXISTS producer_payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      producer_id UUID NOT NULL REFERENCES users(id),
      payout_date DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      method TEXT,
      memo TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      deleted_at TIMESTAMPTZ
    );

    ALTER TABLE producer_payouts
      DROP CONSTRAINT IF EXISTS producer_payouts_status_check;

    ALTER TABLE producer_payouts
      ADD CONSTRAINT producer_payouts_status_check
      CHECK (status IN ('scheduled', 'paid', 'void'));

    CREATE INDEX IF NOT EXISTS producer_payouts_agency_producer_date_idx
      ON producer_payouts (agency_id, producer_id, payout_date DESC);

    CREATE INDEX IF NOT EXISTS producer_payouts_agency_status_date_idx
      ON producer_payouts (agency_id, status, payout_date DESC);

    CREATE TABLE IF NOT EXISTS producer_payout_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      producer_payout_id UUID NOT NULL REFERENCES producer_payouts(id),
      policy_transaction_id UUID NOT NULL REFERENCES policy_transactions(id),
      amount NUMERIC(12,2) NOT NULL,
      memo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_by UUID,
      deleted_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS producer_payout_items_agency_payout_idx
      ON producer_payout_items (agency_id, producer_payout_id);

    CREATE INDEX IF NOT EXISTS producer_payout_items_agency_transaction_idx
      ON producer_payout_items (agency_id, policy_transaction_id);

    CREATE INDEX IF NOT EXISTS producer_payout_items_agency_created_idx
      ON producer_payout_items (agency_id, created_at DESC);

    ALTER TABLE commission_splits ENABLE ROW LEVEL SECURITY;
    ALTER TABLE commission_splits FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS commission_splits_select_policy ON commission_splits;
    DROP POLICY IF EXISTS commission_splits_insert_policy ON commission_splits;
    DROP POLICY IF EXISTS commission_splits_update_policy ON commission_splits;
    DROP POLICY IF EXISTS commission_splits_delete_policy ON commission_splits;

    CREATE POLICY commission_splits_select_policy
    ON commission_splits
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY commission_splits_insert_policy
    ON commission_splits
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY commission_splits_update_policy
    ON commission_splits
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY commission_splits_delete_policy
    ON commission_splits
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    ALTER TABLE producer_payouts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE producer_payouts FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS producer_payouts_select_policy ON producer_payouts;
    DROP POLICY IF EXISTS producer_payouts_insert_policy ON producer_payouts;
    DROP POLICY IF EXISTS producer_payouts_update_policy ON producer_payouts;
    DROP POLICY IF EXISTS producer_payouts_delete_policy ON producer_payouts;

    CREATE POLICY producer_payouts_select_policy
    ON producer_payouts
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY producer_payouts_insert_policy
    ON producer_payouts
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY producer_payouts_update_policy
    ON producer_payouts
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY producer_payouts_delete_policy
    ON producer_payouts
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    ALTER TABLE producer_payout_items ENABLE ROW LEVEL SECURITY;
    ALTER TABLE producer_payout_items FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS producer_payout_items_select_policy ON producer_payout_items;
    DROP POLICY IF EXISTS producer_payout_items_insert_policy ON producer_payout_items;
    DROP POLICY IF EXISTS producer_payout_items_update_policy ON producer_payout_items;
    DROP POLICY IF EXISTS producer_payout_items_delete_policy ON producer_payout_items;

    CREATE POLICY producer_payout_items_select_policy
    ON producer_payout_items
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY producer_payout_items_insert_policy
    ON producer_payout_items
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY producer_payout_items_update_policy
    ON producer_payout_items
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY producer_payout_items_delete_policy
    ON producer_payout_items
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    DROP TRIGGER IF EXISTS commission_splits_set_updated_at ON commission_splits;
    CREATE TRIGGER commission_splits_set_updated_at
    BEFORE UPDATE ON commission_splits
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    DROP TRIGGER IF EXISTS producer_payouts_set_updated_at ON producer_payouts;
    CREATE TRIGGER producer_payouts_set_updated_at
    BEFORE UPDATE ON producer_payouts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    DROP TRIGGER IF EXISTS producer_payout_items_set_updated_at ON producer_payout_items;
    CREATE TRIGGER producer_payout_items_set_updated_at
    BEFORE UPDATE ON producer_payout_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at_timestamp();

    CREATE OR REPLACE FUNCTION policy_assignments_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      producer_exists BOOLEAN;
      csr_exists BOOLEAN;
    BEGIN
      IF NEW.producer_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1
          FROM users
          WHERE id = NEW.producer_id
            AND agency_id = NEW.agency_id
        ) INTO producer_exists;

        IF NOT producer_exists THEN
          RAISE EXCEPTION
            'policies cross-agency or missing producer reference: producer_id=% agency_id=%',
            NEW.producer_id,
            NEW.agency_id;
        END IF;
      END IF;

      IF NEW.csr_id IS NOT NULL THEN
        SELECT EXISTS(
          SELECT 1
          FROM users
          WHERE id = NEW.csr_id
            AND agency_id = NEW.agency_id
        ) INTO csr_exists;

        IF NOT csr_exists THEN
          RAISE EXCEPTION
            'policies cross-agency or missing csr reference: csr_id=% agency_id=%',
            NEW.csr_id,
            NEW.agency_id;
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION commission_splits_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      policy_exists BOOLEAN;
      producer_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM policies
        WHERE id = NEW.policy_id
          AND agency_id = NEW.agency_id
      ) INTO policy_exists;

      IF NOT policy_exists THEN
        RAISE EXCEPTION
          'commission_splits cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM users
        WHERE id = NEW.producer_id
          AND agency_id = NEW.agency_id
      ) INTO producer_exists;

      IF NOT producer_exists THEN
        RAISE EXCEPTION
          'commission_splits cross-agency or missing producer reference: producer_id=% agency_id=%',
          NEW.producer_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION producer_payouts_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      producer_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM users
        WHERE id = NEW.producer_id
          AND agency_id = NEW.agency_id
      ) INTO producer_exists;

      IF NOT producer_exists THEN
        RAISE EXCEPTION
          'producer_payouts cross-agency or missing producer reference: producer_id=% agency_id=%',
          NEW.producer_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION producer_payout_items_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      payout_exists BOOLEAN;
      transaction_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM producer_payouts
        WHERE id = NEW.producer_payout_id
          AND agency_id = NEW.agency_id
      ) INTO payout_exists;

      IF NOT payout_exists THEN
        RAISE EXCEPTION
          'producer_payout_items cross-agency or missing producer_payout reference: producer_payout_id=% agency_id=%',
          NEW.producer_payout_id,
          NEW.agency_id;
      END IF;

      SELECT EXISTS(
        SELECT 1
        FROM policy_transactions
        WHERE id = NEW.policy_transaction_id
          AND agency_id = NEW.agency_id
      ) INTO transaction_exists;

      IF NOT transaction_exists THEN
        RAISE EXCEPTION
          'producer_payout_items cross-agency or missing policy_transaction reference: policy_transaction_id=% agency_id=%',
          NEW.policy_transaction_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS policies_assignments_validate_same_agency_trg ON policies;
    CREATE TRIGGER policies_assignments_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, producer_id, csr_id
    ON policies
    FOR EACH ROW
    EXECUTE FUNCTION policy_assignments_validate_same_agency();

    DROP TRIGGER IF EXISTS commission_splits_validate_same_agency_trg ON commission_splits;
    CREATE TRIGGER commission_splits_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id, producer_id
    ON commission_splits
    FOR EACH ROW
    EXECUTE FUNCTION commission_splits_validate_same_agency();

    DROP TRIGGER IF EXISTS producer_payouts_validate_same_agency_trg ON producer_payouts;
    CREATE TRIGGER producer_payouts_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, producer_id
    ON producer_payouts
    FOR EACH ROW
    EXECUTE FUNCTION producer_payouts_validate_same_agency();

    DROP TRIGGER IF EXISTS producer_payout_items_validate_same_agency_trg ON producer_payout_items;
    CREATE TRIGGER producer_payout_items_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, producer_payout_id, policy_transaction_id
    ON producer_payout_items
    FOR EACH ROW
    EXECUTE FUNCTION producer_payout_items_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS producer_payout_items_validate_same_agency_trg ON producer_payout_items;
    DROP TRIGGER IF EXISTS producer_payouts_validate_same_agency_trg ON producer_payouts;
    DROP TRIGGER IF EXISTS commission_splits_validate_same_agency_trg ON commission_splits;
    DROP TRIGGER IF EXISTS policies_assignments_validate_same_agency_trg ON policies;

    DROP FUNCTION IF EXISTS producer_payout_items_validate_same_agency();
    DROP FUNCTION IF EXISTS producer_payouts_validate_same_agency();
    DROP FUNCTION IF EXISTS commission_splits_validate_same_agency();
    DROP FUNCTION IF EXISTS policy_assignments_validate_same_agency();

    DROP TRIGGER IF EXISTS producer_payout_items_set_updated_at ON producer_payout_items;
    DROP TRIGGER IF EXISTS producer_payouts_set_updated_at ON producer_payouts;
    DROP TRIGGER IF EXISTS commission_splits_set_updated_at ON commission_splits;

    DROP POLICY IF EXISTS producer_payout_items_delete_policy ON producer_payout_items;
    DROP POLICY IF EXISTS producer_payout_items_update_policy ON producer_payout_items;
    DROP POLICY IF EXISTS producer_payout_items_insert_policy ON producer_payout_items;
    DROP POLICY IF EXISTS producer_payout_items_select_policy ON producer_payout_items;

    DROP POLICY IF EXISTS producer_payouts_delete_policy ON producer_payouts;
    DROP POLICY IF EXISTS producer_payouts_update_policy ON producer_payouts;
    DROP POLICY IF EXISTS producer_payouts_insert_policy ON producer_payouts;
    DROP POLICY IF EXISTS producer_payouts_select_policy ON producer_payouts;

    DROP POLICY IF EXISTS commission_splits_delete_policy ON commission_splits;
    DROP POLICY IF EXISTS commission_splits_update_policy ON commission_splits;
    DROP POLICY IF EXISTS commission_splits_insert_policy ON commission_splits;
    DROP POLICY IF EXISTS commission_splits_select_policy ON commission_splits;

    DROP TABLE IF EXISTS producer_payout_items;
    DROP TABLE IF EXISTS producer_payouts;
    DROP TABLE IF EXISTS commission_splits;

    DROP INDEX IF EXISTS policies_agency_csr_idx;
    DROP INDEX IF EXISTS policies_agency_producer_idx;

    ALTER TABLE policies
      DROP CONSTRAINT IF EXISTS policies_csr_id_fkey,
      DROP CONSTRAINT IF EXISTS policies_producer_id_fkey;

    ALTER TABLE policies
      DROP COLUMN IF EXISTS csr_id,
      DROP COLUMN IF EXISTS producer_id;
  `);
};
