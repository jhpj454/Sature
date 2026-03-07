exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS policies_agency_id_id_idx
      ON policies (agency_id, id);

    CREATE INDEX IF NOT EXISTS service_cases_agency_id_id_idx
      ON service_cases (agency_id, id);

    CREATE INDEX IF NOT EXISTS policy_transactions_agency_id_id_idx
      ON policy_transactions (agency_id, id);

    CREATE INDEX IF NOT EXISTS contacts_agency_id_id_idx
      ON contacts (agency_id, id);

    CREATE INDEX IF NOT EXISTS carriers_agency_id_id_idx
      ON carriers (agency_id, id);

    CREATE INDEX IF NOT EXISTS documents_agency_id_id_idx
      ON documents (agency_id, id);

    CREATE OR REPLACE FUNCTION validate_entity_reference_same_agency(
      p_entity_type TEXT,
      p_entity_id UUID,
      p_agency_id UUID,
      p_context TEXT
    ) RETURNS VOID AS $$
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
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION contact_roles_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      contact_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM contacts
        WHERE id = NEW.contact_id
          AND agency_id = NEW.agency_id
      ) INTO contact_exists;

      IF NOT contact_exists THEN
        RAISE EXCEPTION
          'contact_roles cross-agency or missing contact reference: contact_id=% agency_id=%',
          NEW.contact_id,
          NEW.agency_id;
      END IF;

      PERFORM validate_entity_reference_same_agency(
        NEW.entity_type,
        NEW.entity_id,
        NEW.agency_id,
        'contact_roles'
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION policy_transactions_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      policy_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM policies
        WHERE id = NEW.policy_id
          AND agency_id = NEW.agency_id
      ) INTO policy_exists;

      IF NOT policy_exists THEN
        RAISE EXCEPTION
          'policy_transactions cross-agency or missing policy reference: policy_id=% agency_id=%',
          NEW.policy_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION policy_lines_validate_same_agency()
    RETURNS TRIGGER AS $$
    DECLARE
      tx_exists BOOLEAN;
    BEGIN
      SELECT EXISTS(
        SELECT 1
        FROM policy_transactions
        WHERE id = NEW.policy_transaction_id
          AND agency_id = NEW.agency_id
      ) INTO tx_exists;

      IF NOT tx_exists THEN
        RAISE EXCEPTION
          'policy_lines cross-agency or missing policy_transaction reference: policy_transaction_id=% agency_id=%',
          NEW.policy_transaction_id,
          NEW.agency_id;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION activities_validate_same_agency()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM validate_entity_reference_same_agency(
        NEW.entity_type,
        NEW.entity_id,
        NEW.agency_id,
        'activities'
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION documents_validate_same_agency()
    RETURNS TRIGGER AS $$
    BEGIN
      PERFORM validate_entity_reference_same_agency(
        NEW.entity_type,
        NEW.entity_id,
        NEW.agency_id,
        'documents'
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS contact_roles_validate_same_agency_trg ON contact_roles;
    CREATE TRIGGER contact_roles_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, contact_id, entity_type, entity_id
    ON contact_roles
    FOR EACH ROW
    EXECUTE FUNCTION contact_roles_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_transactions_validate_same_agency_trg ON policy_transactions;
    CREATE TRIGGER policy_transactions_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_id
    ON policy_transactions
    FOR EACH ROW
    EXECUTE FUNCTION policy_transactions_validate_same_agency();

    DROP TRIGGER IF EXISTS policy_lines_validate_same_agency_trg ON policy_lines;
    CREATE TRIGGER policy_lines_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, policy_transaction_id
    ON policy_lines
    FOR EACH ROW
    EXECUTE FUNCTION policy_lines_validate_same_agency();

    DROP TRIGGER IF EXISTS activities_validate_same_agency_trg ON activities;
    CREATE TRIGGER activities_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, entity_type, entity_id
    ON activities
    FOR EACH ROW
    EXECUTE FUNCTION activities_validate_same_agency();

    DROP TRIGGER IF EXISTS documents_validate_same_agency_trg ON documents;
    CREATE TRIGGER documents_validate_same_agency_trg
    BEFORE INSERT OR UPDATE OF agency_id, entity_type, entity_id
    ON documents
    FOR EACH ROW
    EXECUTE FUNCTION documents_validate_same_agency();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS documents_validate_same_agency_trg ON documents;
    DROP TRIGGER IF EXISTS activities_validate_same_agency_trg ON activities;
    DROP TRIGGER IF EXISTS policy_lines_validate_same_agency_trg ON policy_lines;
    DROP TRIGGER IF EXISTS policy_transactions_validate_same_agency_trg ON policy_transactions;
    DROP TRIGGER IF EXISTS contact_roles_validate_same_agency_trg ON contact_roles;

    DROP FUNCTION IF EXISTS documents_validate_same_agency();
    DROP FUNCTION IF EXISTS activities_validate_same_agency();
    DROP FUNCTION IF EXISTS policy_lines_validate_same_agency();
    DROP FUNCTION IF EXISTS policy_transactions_validate_same_agency();
    DROP FUNCTION IF EXISTS contact_roles_validate_same_agency();
    DROP FUNCTION IF EXISTS validate_entity_reference_same_agency(TEXT, UUID, UUID, TEXT);

    DROP INDEX IF EXISTS documents_agency_id_id_idx;
    DROP INDEX IF EXISTS carriers_agency_id_id_idx;
    DROP INDEX IF EXISTS contacts_agency_id_id_idx;
    DROP INDEX IF EXISTS policy_transactions_agency_id_id_idx;
    DROP INDEX IF EXISTS service_cases_agency_id_id_idx;
    DROP INDEX IF EXISTS policies_agency_id_id_idx;
  `);
};
