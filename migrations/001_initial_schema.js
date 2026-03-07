const TENANT_TABLES = [
  "users",
  "accounts",
  "contacts",
  "contact_roles",
  "carriers",
  "policies",
  "policy_exposures",
  "policy_transactions",
  "transaction_changes",
  "service_cases",
  "tasks",
  "activities",
  "documents",
  "document_links",
  "certificate_holders",
  "certificate_wording_library",
  "coi_requests",
  "claims",
  "events",
  "audit_log",
  "sessions",
];

const UPDATED_AT_TABLES = [
  "agencies",
  ...TENANT_TABLES,
];

exports.up = (pgm) => {
  pgm.createExtension("pgcrypto", { ifNotExists: true });

  pgm.sql(`
    CREATE TYPE agency_plan AS ENUM ('saturate', 'enterprise');
    CREATE TYPE agency_status AS ENUM ('active', 'trial', 'paused', 'canceled');

    CREATE TYPE user_role AS ENUM ('producer', 'csr', 'marketing', 'accounting', 'admin');
    CREATE TYPE user_status AS ENUM ('active', 'invited', 'suspended');

    CREATE TYPE account_type AS ENUM ('commercial', 'personal');
    CREATE TYPE account_status AS ENUM ('prospect', 'client', 'lost');

    CREATE TYPE preferred_contact_method AS ENUM ('email', 'phone', 'text');
    CREATE TYPE consent_status AS ENUM ('subscribed', 'unsubscribed', 'pending');
    CREATE TYPE sms_consent_status AS ENUM ('opted_in', 'opted_out', 'pending');
    CREATE TYPE contact_source AS ENUM ('referral', 'import', 'website', 'manual', 'other');
    CREATE TYPE contact_role AS ENUM (
      'insured',
      'owner',
      'driver',
      'billing_contact',
      'certificate_holder_contact',
      'additional_insured_contact',
      'claims_contact'
    );

    CREATE TYPE policy_status AS ENUM ('quoted', 'active', 'canceled', 'expired', 'pending');
    CREATE TYPE billing_type AS ENUM ('direct_bill', 'agency_bill');

    CREATE TYPE exposure_type AS ENUM ('location', 'building', 'vehicle', 'driver', 'class_code', 'payroll', 'equipment', 'other');

    CREATE TYPE transaction_type AS ENUM ('endorsement', 'renewal', 'cancellation', 'reinstatement', 'rewrite', 'audit', 'new_business');
    CREATE TYPE transaction_status AS ENUM ('intake', 'waiting_on_insured', 'waiting_on_carrier', 'approved', 'completed', 'declined');
    CREATE TYPE change_type AS ENUM ('add', 'update', 'remove');
    CREATE TYPE transaction_target_type AS ENUM ('policy_field', 'exposure');

    CREATE TYPE service_case_type AS ENUM ('endorsement', 'renewal', 'coi', 'claim', 'billing', 'cancellation', 'other');
    CREATE TYPE service_case_status AS ENUM ('open', 'in_progress', 'waiting', 'done', 'closed');
    CREATE TYPE service_case_priority AS ENUM ('low', 'normal', 'high', 'urgent');

    CREATE TYPE task_status AS ENUM ('open', 'completed');
    CREATE TYPE activity_type AS ENUM ('note', 'call', 'email', 'meeting', 'system');

    CREATE TYPE coi_request_status AS ENUM ('requested', 'needs_approval', 'approved', 'issued', 'declined');

    CREATE TYPE claim_status AS ENUM ('open', 'closed');

    CREATE TABLE agencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      plan agency_plan NOT NULL,
      status agency_status NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role user_role NOT NULL,
      status user_status NOT NULL,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (agency_id, email)
    );

    CREATE TABLE accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_type account_type NOT NULL,
      account_name TEXT NOT NULL,
      status account_status NOT NULL,
      assigned_producer_id UUID REFERENCES users(id),
      assigned_csr_id UUID REFERENCES users(id),
      industry_segment TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      preferred_contact_method preferred_contact_method,
      timezone TEXT,
      email_consent_status consent_status,
      sms_consent_status sms_consent_status,
      do_not_contact BOOLEAN NOT NULL DEFAULT false,
      source contact_source,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE contact_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      contact_id UUID NOT NULL REFERENCES contacts(id),
      role contact_role NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (agency_id, contact_id, role)
    );

    CREATE TABLE carriers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      name TEXT NOT NULL,
      naic TEXT,
      support_contact_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (agency_id, name)
    );

    CREATE TABLE policies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      carrier_id UUID REFERENCES carriers(id),
      lob TEXT NOT NULL,
      policy_number TEXT NOT NULL,
      effective_date DATE NOT NULL,
      expiration_date DATE NOT NULL,
      status policy_status NOT NULL,
      billing_type billing_type NOT NULL,
      premium_amount NUMERIC(12,2) NOT NULL,
      commission_estimate_amount NUMERIC(12,2) NOT NULL,
      agency_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      agency_revenue_estimate_amount NUMERIC(12,2) NOT NULL,
      assigned_csr_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE policy_exposures (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      exposure_type exposure_type NOT NULL,
      data_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE policy_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      policy_id UUID NOT NULL REFERENCES policies(id),
      transaction_type transaction_type NOT NULL,
      status transaction_status NOT NULL,
      effective_date DATE,
      premium_delta_amount NUMERIC(12,2),
      commission_delta_amount NUMERIC(12,2),
      fee_delta_amount NUMERIC(12,2),
      agency_revenue_delta_amount NUMERIC(12,2),
      requested_by_user_id UUID REFERENCES users(id),
      assigned_to_user_id UUID REFERENCES users(id),
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE transaction_changes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      transaction_id UUID NOT NULL REFERENCES policy_transactions(id),
      change_type change_type NOT NULL,
      target_type transaction_target_type NOT NULL,
      target_ref TEXT,
      before_json JSONB,
      after_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE service_cases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      case_type service_case_type NOT NULL,
      status service_case_status NOT NULL,
      priority service_case_priority NOT NULL,
      account_id UUID REFERENCES accounts(id),
      policy_id UUID REFERENCES policies(id),
      transaction_id UUID REFERENCES policy_transactions(id),
      assigned_to_user_id UUID REFERENCES users(id),
      due_date DATE,
      sla_due_at TIMESTAMPTZ,
      title TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      status task_status NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATE,
      assigned_to_user_id UUID REFERENCES users(id),
      created_by_user_id UUID REFERENCES users(id),
      linked_entity_type TEXT,
      linked_entity_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      activity_type activity_type NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      content TEXT,
      created_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      uploaded_by_user_id UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE document_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      document_id UUID NOT NULL REFERENCES documents(id),
      entity_type TEXT NOT NULL,
      entity_id UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE certificate_holders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      holder_name TEXT NOT NULL,
      holder_address TEXT,
      holder_email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE certificate_wording_library (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      name TEXT NOT NULL,
      wording_text TEXT NOT NULL,
      requires_approval BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE coi_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_id UUID NOT NULL REFERENCES accounts(id),
      policy_id UUID REFERENCES policies(id),
      holder_id UUID REFERENCES certificate_holders(id),
      wording_id UUID REFERENCES certificate_wording_library(id),
      status coi_request_status NOT NULL,
      requested_by_user_id UUID REFERENCES users(id),
      approved_by_user_id UUID REFERENCES users(id),
      issued_document_id UUID REFERENCES documents(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE claims (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      account_id UUID REFERENCES accounts(id),
      policy_id UUID REFERENCES policies(id),
      loss_date DATE,
      status claim_status NOT NULL,
      carrier_claim_number TEXT,
      summary TEXT,
      adjuster_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id UUID,
      contact_id UUID REFERENCES contacts(id),
      meta_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      actor_user_id UUID REFERENCES users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      before_json JSONB,
      after_json JSONB,
      request_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agency_id UUID NOT NULL REFERENCES agencies(id),
      user_id UUID NOT NULL REFERENCES users(id),
      session_token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX users_agency_role_idx ON users (agency_id, role);
    CREATE INDEX users_agency_status_idx ON users (agency_id, status);

    CREATE INDEX accounts_agency_status_idx ON accounts (agency_id, status);
    CREATE INDEX accounts_agency_assigned_producer_idx ON accounts (agency_id, assigned_producer_id);

    CREATE INDEX contacts_agency_account_idx ON contacts (agency_id, account_id);
    CREATE INDEX contacts_agency_email_idx ON contacts (agency_id, email);

    CREATE INDEX policies_agency_expiration_idx ON policies (agency_id, expiration_date);
    CREATE INDEX policies_agency_status_idx ON policies (agency_id, status);
    CREATE INDEX policies_agency_account_idx ON policies (agency_id, account_id);

    CREATE INDEX policy_exposures_agency_policy_idx ON policy_exposures (agency_id, policy_id);

    CREATE INDEX policy_transactions_agency_policy_idx ON policy_transactions (agency_id, policy_id);
    CREATE INDEX policy_transactions_agency_status_idx ON policy_transactions (agency_id, status);

    CREATE INDEX service_cases_agency_status_idx ON service_cases (agency_id, status);
    CREATE INDEX service_cases_agency_assigned_idx ON service_cases (agency_id, assigned_to_user_id);
    CREATE INDEX service_cases_agency_due_date_idx ON service_cases (agency_id, due_date);

    CREATE INDEX events_agency_event_type_idx ON events (agency_id, event_type);
    CREATE INDEX events_agency_created_at_idx ON events (agency_id, created_at);

    CREATE INDEX audit_log_agency_entity_type_idx ON audit_log (agency_id, entity_type);
    CREATE INDEX audit_log_agency_created_at_idx ON audit_log (agency_id, created_at);

    CREATE INDEX sessions_agency_user_idx ON sessions (agency_id, user_id);
    CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

    CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'audit_log is append-only';
    END;
    $$ LANGUAGE plpgsql;
  `);

  for (const table of UPDATED_AT_TABLES) {
    if (table === "sessions") continue;
    pgm.sql(`
      CREATE TRIGGER ${table}_set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION set_updated_at_timestamp();
    `);
  }

  pgm.sql(`
    CREATE TRIGGER audit_log_prevent_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_mutation();

    CREATE TRIGGER audit_log_prevent_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_mutation();
  `);

  for (const table of TENANT_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    pgm.sql(`
      CREATE POLICY ${table}_select_policy
      ON ${table}
      FOR SELECT
      USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);
    `);
    pgm.sql(`
      CREATE POLICY ${table}_insert_policy
      ON ${table}
      FOR INSERT
      WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);
    `);
    pgm.sql(`
      CREATE POLICY ${table}_update_policy
      ON ${table}
      FOR UPDATE
      USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid)
      WITH CHECK (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);
    `);
    pgm.sql(`
      CREATE POLICY ${table}_delete_policy
      ON ${table}
      FOR DELETE
      USING (agency_id = nullif(current_setting('app.current_agency_id', true), '')::uuid);
    `);
  }
};

exports.down = (pgm) => {
  for (const table of TENANT_TABLES) {
    pgm.sql(`DROP POLICY IF EXISTS ${table}_delete_policy ON ${table};`);
    pgm.sql(`DROP POLICY IF EXISTS ${table}_update_policy ON ${table};`);
    pgm.sql(`DROP POLICY IF EXISTS ${table}_insert_policy ON ${table};`);
    pgm.sql(`DROP POLICY IF EXISTS ${table}_select_policy ON ${table};`);
  }

  pgm.sql(`
    DROP TRIGGER IF EXISTS audit_log_prevent_delete ON audit_log;
    DROP TRIGGER IF EXISTS audit_log_prevent_update ON audit_log;
  `);

  for (const table of UPDATED_AT_TABLES) {
    if (table === "sessions") continue;
    pgm.sql(`DROP TRIGGER IF EXISTS ${table}_set_updated_at ON ${table};`);
  }

  pgm.sql(`
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS events CASCADE;
    DROP TABLE IF EXISTS claims CASCADE;
    DROP TABLE IF EXISTS coi_requests CASCADE;
    DROP TABLE IF EXISTS certificate_wording_library CASCADE;
    DROP TABLE IF EXISTS certificate_holders CASCADE;
    DROP TABLE IF EXISTS document_links CASCADE;
    DROP TABLE IF EXISTS documents CASCADE;
    DROP TABLE IF EXISTS activities CASCADE;
    DROP TABLE IF EXISTS tasks CASCADE;
    DROP TABLE IF EXISTS service_cases CASCADE;
    DROP TABLE IF EXISTS transaction_changes CASCADE;
    DROP TABLE IF EXISTS policy_transactions CASCADE;
    DROP TABLE IF EXISTS policy_exposures CASCADE;
    DROP TABLE IF EXISTS policies CASCADE;
    DROP TABLE IF EXISTS carriers CASCADE;
    DROP TABLE IF EXISTS contact_roles CASCADE;
    DROP TABLE IF EXISTS contacts CASCADE;
    DROP TABLE IF EXISTS accounts CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS agencies CASCADE;

    DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
    DROP FUNCTION IF EXISTS set_updated_at_timestamp();

    DROP TYPE IF EXISTS claim_status;
    DROP TYPE IF EXISTS coi_request_status;
    DROP TYPE IF EXISTS activity_type;
    DROP TYPE IF EXISTS task_status;
    DROP TYPE IF EXISTS service_case_priority;
    DROP TYPE IF EXISTS service_case_status;
    DROP TYPE IF EXISTS service_case_type;
    DROP TYPE IF EXISTS transaction_target_type;
    DROP TYPE IF EXISTS change_type;
    DROP TYPE IF EXISTS transaction_status;
    DROP TYPE IF EXISTS transaction_type;
    DROP TYPE IF EXISTS exposure_type;
    DROP TYPE IF EXISTS billing_type;
    DROP TYPE IF EXISTS policy_status;
    DROP TYPE IF EXISTS contact_role;
    DROP TYPE IF EXISTS contact_source;
    DROP TYPE IF EXISTS sms_consent_status;
    DROP TYPE IF EXISTS consent_status;
    DROP TYPE IF EXISTS preferred_contact_method;
    DROP TYPE IF EXISTS account_status;
    DROP TYPE IF EXISTS account_type;
    DROP TYPE IF EXISTS user_status;
    DROP TYPE IF EXISTS user_role;
    DROP TYPE IF EXISTS agency_status;
    DROP TYPE IF EXISTS agency_plan;

    DROP EXTENSION IF EXISTS pgcrypto;
  `);
};
