exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE policies
      ADD COLUMN IF NOT EXISTS commission_expected NUMERIC(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS commission_received NUMERIC(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_transaction_id UUID;

    ALTER TABLE policy_transactions
      ALTER COLUMN transaction_type TYPE TEXT USING transaction_type::TEXT,
      ALTER COLUMN status TYPE TEXT USING status::TEXT;

    ALTER TABLE policy_transactions
      ADD COLUMN IF NOT EXISTS transaction_date DATE,
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS memo TEXT,
      ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS commission_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cash_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS revenue_event TEXT NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS premium_delta NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS fees_delta NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS updated_by UUID,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

    UPDATE policy_transactions
    SET
      transaction_type = CASE
        WHEN transaction_type = 'audit' THEN 'commission_adj'
        ELSE transaction_type
      END,
      status = CASE
        WHEN status IN ('completed', 'approved') THEN 'posted'
        WHEN status IN ('intake', 'waiting_on_insured', 'waiting_on_carrier') THEN 'pending'
        WHEN status IN ('declined') THEN 'void'
        WHEN status IN ('posted', 'pending', 'void') THEN status
        ELSE 'pending'
      END,
      transaction_date = COALESCE(transaction_date, created_at::DATE),
      memo = COALESCE(memo, summary),
      commission_delta = COALESCE(commission_delta_amount, 0),
      cash_delta = COALESCE(agency_revenue_delta_amount, 0),
      premium_delta = COALESCE(premium_delta, premium_delta_amount),
      fees_delta = COALESCE(fees_delta, fee_delta_amount),
      created_by = COALESCE(created_by, requested_by_user_id),
      updated_by = COALESCE(updated_by, assigned_to_user_id, requested_by_user_id)
    WHERE TRUE;

    ALTER TABLE policy_transactions
      ALTER COLUMN transaction_date SET NOT NULL;

    ALTER TABLE policy_transactions
      DROP CONSTRAINT IF EXISTS policy_transactions_transaction_type_check,
      DROP CONSTRAINT IF EXISTS policy_transactions_status_check,
      DROP CONSTRAINT IF EXISTS policy_transactions_source_check,
      DROP CONSTRAINT IF EXISTS policy_transactions_revenue_event_check;

    ALTER TABLE policy_transactions
      ADD CONSTRAINT policy_transactions_transaction_type_check
      CHECK (
        transaction_type IN (
          'new_business',
          'renewal',
          'endorsement',
          'cancellation',
          'reinstatement',
          'rewrite',
          'billing_change',
          'commission_adj',
          'payment',
          'refund'
        )
      ),
      ADD CONSTRAINT policy_transactions_status_check
      CHECK (status IN ('posted', 'pending', 'void')),
      ADD CONSTRAINT policy_transactions_source_check
      CHECK (source IN ('manual', 'import', 'integration')),
      ADD CONSTRAINT policy_transactions_revenue_event_check
      CHECK (revenue_event IN ('earned', 'paid', 'chargeback', 'none'));

    ALTER TABLE policy_transactions
      DROP COLUMN IF EXISTS premium_delta_amount,
      DROP COLUMN IF EXISTS commission_delta_amount,
      DROP COLUMN IF EXISTS fee_delta_amount,
      DROP COLUMN IF EXISTS agency_revenue_delta_amount,
      DROP COLUMN IF EXISTS requested_by_user_id,
      DROP COLUMN IF EXISTS assigned_to_user_id,
      DROP COLUMN IF EXISTS summary;

    DROP INDEX IF EXISTS policy_transactions_agency_policy_idx;
    DROP INDEX IF EXISTS policy_transactions_agency_status_idx;
    DROP INDEX IF EXISTS policy_transactions_agency_policy_date_desc_idx;
    DROP INDEX IF EXISTS policy_transactions_agency_type_date_desc_idx;

    CREATE INDEX IF NOT EXISTS policy_transactions_agency_policy_date_desc_idx
      ON policy_transactions (agency_id, policy_id, transaction_date DESC);

    CREATE INDEX IF NOT EXISTS policy_transactions_agency_type_date_desc_idx
      ON policy_transactions (agency_id, transaction_type, transaction_date DESC);

    DROP POLICY IF EXISTS policy_transactions_select_policy ON policy_transactions;
    DROP POLICY IF EXISTS policy_transactions_insert_policy ON policy_transactions;
    DROP POLICY IF EXISTS policy_transactions_update_policy ON policy_transactions;
    DROP POLICY IF EXISTS policy_transactions_delete_policy ON policy_transactions;

    ALTER TABLE policy_transactions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE policy_transactions FORCE ROW LEVEL SECURITY;

    CREATE POLICY policy_transactions_select_policy
    ON policy_transactions
    FOR SELECT
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_transactions_insert_policy
    ON policy_transactions
    FOR INSERT
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_transactions_update_policy
    ON policy_transactions
    FOR UPDATE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
    WITH CHECK (agency_id = current_setting('app.current_agency_id', true)::uuid);

    CREATE POLICY policy_transactions_delete_policy
    ON policy_transactions
    FOR DELETE
    USING (agency_id = current_setting('app.current_agency_id', true)::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS policy_transactions_delete_policy ON policy_transactions;
    DROP POLICY IF EXISTS policy_transactions_update_policy ON policy_transactions;
    DROP POLICY IF EXISTS policy_transactions_insert_policy ON policy_transactions;
    DROP POLICY IF EXISTS policy_transactions_select_policy ON policy_transactions;

    CREATE POLICY policy_transactions_select_policy
    ON policy_transactions
    FOR SELECT
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY policy_transactions_insert_policy
    ON policy_transactions
    FOR INSERT
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY policy_transactions_update_policy
    ON policy_transactions
    FOR UPDATE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
    WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    CREATE POLICY policy_transactions_delete_policy
    ON policy_transactions
    FOR DELETE
    USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);

    DROP INDEX IF EXISTS policy_transactions_agency_type_date_desc_idx;
    DROP INDEX IF EXISTS policy_transactions_agency_policy_date_desc_idx;

    CREATE INDEX IF NOT EXISTS policy_transactions_agency_policy_idx
      ON policy_transactions (agency_id, policy_id);

    CREATE INDEX IF NOT EXISTS policy_transactions_agency_status_idx
      ON policy_transactions (agency_id, status);

    ALTER TABLE policy_transactions
      ADD COLUMN IF NOT EXISTS premium_delta_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS commission_delta_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS fee_delta_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS agency_revenue_delta_amount NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS requested_by_user_id UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS summary TEXT;

    UPDATE policy_transactions
    SET
      premium_delta_amount = premium_delta,
      commission_delta_amount = commission_delta,
      fee_delta_amount = fees_delta,
      agency_revenue_delta_amount = cash_delta,
      requested_by_user_id = created_by,
      assigned_to_user_id = updated_by,
      summary = memo;

    ALTER TABLE policy_transactions
      DROP CONSTRAINT IF EXISTS policy_transactions_transaction_type_check,
      DROP CONSTRAINT IF EXISTS policy_transactions_status_check,
      DROP CONSTRAINT IF EXISTS policy_transactions_source_check,
      DROP CONSTRAINT IF EXISTS policy_transactions_revenue_event_check;

    ALTER TABLE policy_transactions
      ALTER COLUMN transaction_type TYPE transaction_type
      USING (
        CASE transaction_type
          WHEN 'new_business' THEN 'new_business'
          WHEN 'renewal' THEN 'renewal'
          WHEN 'endorsement' THEN 'endorsement'
          WHEN 'cancellation' THEN 'cancellation'
          WHEN 'reinstatement' THEN 'reinstatement'
          WHEN 'rewrite' THEN 'rewrite'
          WHEN 'billing_change' THEN 'endorsement'
          WHEN 'commission_adj' THEN 'audit'
          WHEN 'payment' THEN 'endorsement'
          WHEN 'refund' THEN 'endorsement'
          ELSE 'endorsement'
        END
      )::transaction_type,
      ALTER COLUMN status TYPE transaction_status
      USING (
        CASE status
          WHEN 'posted' THEN 'completed'
          WHEN 'pending' THEN 'intake'
          WHEN 'void' THEN 'declined'
          ELSE 'intake'
        END
      )::transaction_status;

    ALTER TABLE policy_transactions
      DROP COLUMN IF EXISTS deleted_at,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS fees_delta,
      DROP COLUMN IF EXISTS premium_delta,
      DROP COLUMN IF EXISTS revenue_event,
      DROP COLUMN IF EXISTS cash_delta,
      DROP COLUMN IF EXISTS commission_delta,
      DROP COLUMN IF EXISTS data,
      DROP COLUMN IF EXISTS memo,
      DROP COLUMN IF EXISTS source,
      DROP COLUMN IF EXISTS transaction_date;

    ALTER TABLE policies
      DROP COLUMN IF EXISTS last_transaction_id,
      DROP COLUMN IF EXISTS commission_received,
      DROP COLUMN IF EXISTS commission_expected;
  `);
};
