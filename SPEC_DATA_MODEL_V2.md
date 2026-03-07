Saturate Core Data Model Spec v2
Project: Saturate (working name)
Scope: AMS Foundation + Sales CRM–Ready + Marketing-Prepared + Automation-First
Database: PostgreSQL
ID Type: UUID (gen_random_uuid())
Tenancy: Strict Multi-Tenant with Postgres RLS
Philosophy: Revenue-first, term-accurate, transaction-driven, audit-safe, automation-native
0. Global Architecture Rules (Non-Negotiable)
0.1 Multi-Tenancy + RLS
Every business table includes:
agency_id UUID NOT NULL REFERENCES agencies(id)
RLS is enabled on all tenant tables. Every query must enforce:
agency_id = current_setting('app.current_agency_id')::uuid
0.2 IDs
All PKs:
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
0.3 Timestamps + Soft Delete
All business tables include:
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
deleted_at TIMESTAMPTZ NULL
All “uniques” that must ignore soft-deleted rows use partial unique indexes:
UNIQUE (...) WHERE deleted_at IS NULL
0.4 Audit + Request Correlation
All write paths must emit:
audit_log row (who/what/when/before/after/request_id)
events row (event_type/entity/meta/request_id)
0.5 Revenue-First
Dashboards and reporting are driven by revenue:
agency_revenue = commission + agency_fees
Revenue is stored explicitly at term-level and delta-level.
1. Tenancy & Identity
1.1 agencies
Represents a paying tenant agency.
id
name TEXT NOT NULL
timezone TEXT NOT NULL
plan TEXT NOT NULL CHECK (plan IN ('saturate','enterprise'))
status TEXT NOT NULL CHECK (status IN ('active','trial','paused','canceled'))
created_at, updated_at, deleted_at
Indexes:
(status) WHERE deleted_at IS NULL
1.2 users
Represents a person who logs into Saturate.
id
agency_id
email TEXT NOT NULL
password_hash TEXT NOT NULL
display_name TEXT NOT NULL
role TEXT NOT NULL CHECK (role IN ('producer','csr','marketing','accounting','admin'))
status TEXT NOT NULL CHECK (status IN ('active','invited','suspended'))
last_login_at TIMESTAMPTZ NULL
created_at, updated_at, deleted_at
Constraints / Indexes:
UNIQUE (agency_id, email) WHERE deleted_at IS NULL
(agency_id, role) WHERE deleted_at IS NULL
2. Accounts & Contacts (CRM + AMS Shared Core)
2.1 accounts
Represents an insured entity (business or household).
id
agency_id
account_type TEXT NOT NULL CHECK (account_type IN ('commercial','personal'))
account_name TEXT NOT NULL
status TEXT NOT NULL CHECK (status IN ('prospect','client','lost'))
assigned_producer_id UUID NULL REFERENCES users(id)
assigned_csr_id UUID NULL REFERENCES users(id)
industry_segment TEXT NULL
notes TEXT NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, status) WHERE deleted_at IS NULL
(agency_id, assigned_producer_id) WHERE deleted_at IS NULL
(agency_id, assigned_csr_id) WHERE deleted_at IS NULL
2.2 contacts
Represents a person tied to an account.
id
agency_id
account_id UUID NOT NULL REFERENCES accounts(id)
first_name TEXT NOT NULL
last_name TEXT NOT NULL
email TEXT NULL
phone TEXT NULL
preferred_contact_method TEXT NULL CHECK (preferred_contact_method IN ('email','phone','text'))
timezone TEXT NULL
do_not_contact BOOLEAN NOT NULL DEFAULT false
source TEXT NULL CHECK (source IN ('referral','import','website','manual','other'))
created_at, updated_at, deleted_at
Indexes:
(agency_id, account_id) WHERE deleted_at IS NULL
(agency_id, email) WHERE deleted_at IS NULL
2.3 contact_roles
Allows a contact to hold multiple roles.
id
agency_id
account_id UUID NOT NULL REFERENCES accounts(id)
contact_id UUID NOT NULL REFERENCES contacts(id)
role TEXT NOT NULL CHECK (role IN ('insured','owner','driver','billing_contact','certificate_holder_contact','additional_insured_contact','claims_contact'))
created_at, updated_at, deleted_at
Constraints:
UNIQUE (agency_id, contact_id, role) WHERE deleted_at IS NULL
3. Consent & Compliance (Marketing-Ready, Audit-Safe)
3.1 contact_channel_consents (current state)
Current effective consent status per channel.
id
agency_id
contact_id UUID NOT NULL REFERENCES contacts(id)
channel TEXT NOT NULL CHECK (channel IN ('email','sms'))
status TEXT NOT NULL CHECK (status IN ('subscribed','unsubscribed','pending','opted_in','opted_out'))
source TEXT NULL (where consent came from)
effective_at TIMESTAMPTZ NOT NULL DEFAULT now()
created_at, updated_at, deleted_at
Constraints:
UNIQUE (agency_id, contact_id, channel) WHERE deleted_at IS NULL
3.2 consent_log (immutable history)
Every consent change is appended here.
id
agency_id
contact_id
channel
old_status TEXT NULL
new_status TEXT NOT NULL
change_source TEXT NULL
actor_user_id UUID NULL REFERENCES users(id)
request_id TEXT NULL
created_at (no updated_at needed), deleted_at NULL (rarely used)
Indexes:
(agency_id, contact_id, channel, created_at DESC)
4. Carriers, Lines of Business, Policies (Term-Accurate)
4.1 carriers
id
agency_id
name TEXT NOT NULL
naic TEXT NULL
support_contact_json JSONB NULL
created_at, updated_at, deleted_at
Constraints:
UNIQUE (agency_id, name) WHERE deleted_at IS NULL
4.2 lines_of_business
Agency-configurable LOB catalog.
id
agency_id
code TEXT NOT NULL (e.g., AUTO, GL, WC)
display_name TEXT NOT NULL
created_at, updated_at, deleted_at
Constraints:
UNIQUE (agency_id, code) WHERE deleted_at IS NULL
4.3 policies (identity “header”)
Stable identity of a policy across terms.
id
agency_id
account_id UUID NOT NULL REFERENCES accounts(id)
carrier_id UUID NOT NULL REFERENCES carriers(id)
lob_id UUID NOT NULL REFERENCES lines_of_business(id)
policy_number TEXT NOT NULL
status TEXT NOT NULL CHECK (status IN ('quoted','active','canceled','expired','pending'))
billing_type TEXT NULL CHECK (billing_type IN ('direct_bill','agency_bill'))
assigned_csr_id UUID NULL REFERENCES users(id)
created_at, updated_at, deleted_at
Constraints / Indexes:
UNIQUE (agency_id, policy_number) WHERE deleted_at IS NULL
(agency_id, status) WHERE deleted_at IS NULL
(agency_id, account_id) WHERE deleted_at IS NULL
4.4 policy_terms (term + money lives here)
Each renewal creates a new term row.
id
agency_id
policy_id UUID NOT NULL REFERENCES policies(id)
term_effective_date DATE NOT NULL
term_expiration_date DATE NOT NULL
term_status TEXT NOT NULL CHECK (term_status IN ('quoted','active','canceled','expired','pending'))
premium_amount NUMERIC(12,2) NOT NULL DEFAULT 0
commission_estimate_amount NUMERIC(12,2) NOT NULL DEFAULT 0
agency_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0
agency_revenue_estimate_amount NUMERIC(12,2) NOT NULL DEFAULT 0
created_at, updated_at, deleted_at
Constraints / Indexes:
(agency_id, term_expiration_date) WHERE deleted_at IS NULL
(agency_id, policy_id, term_expiration_date DESC) WHERE deleted_at IS NULL
Optional (later): prevent overlapping terms per policy.
4.5 policy_exposures
Flexible risk items (vehicles, locations, drivers, etc.) scoped to a term or a policy.
id
agency_id
policy_id UUID NOT NULL REFERENCES policies(id)
policy_term_id UUID NULL REFERENCES policy_terms(id) (recommended once exposures differ by term)
exposure_type TEXT NOT NULL CHECK (exposure_type IN ('location','building','vehicle','driver','class_code','payroll','equipment','other'))
data_json JSONB NOT NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, policy_id) WHERE deleted_at IS NULL
(agency_id, policy_term_id) WHERE deleted_at IS NULL
5. Policy Transactions (Core AMS Engine)
5.1 policy_transactions
The canonical AMS work engine.
id
agency_id
policy_id UUID NOT NULL REFERENCES policies(id)
policy_term_id UUID NULL REFERENCES policy_terms(id) (the term being created/modified)
transaction_type TEXT NOT NULL CHECK (transaction_type IN ('endorsement','renewal','cancellation','reinstatement','rewrite','audit','new_business'))
status TEXT NOT NULL CHECK (status IN ('intake','waiting_on_insured','waiting_on_carrier','approved','completed','declined'))
effective_date DATE NOT NULL
premium_delta_amount NUMERIC(12,2) NOT NULL DEFAULT 0
commission_delta_amount NUMERIC(12,2) NOT NULL DEFAULT 0
fee_delta_amount NUMERIC(12,2) NOT NULL DEFAULT 0
agency_revenue_delta_amount NUMERIC(12,2) NOT NULL DEFAULT 0
requested_by_user_id UUID NULL REFERENCES users(id)
assigned_to_user_id UUID NULL REFERENCES users(id)
summary TEXT NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, policy_id) WHERE deleted_at IS NULL
(agency_id, status) WHERE deleted_at IS NULL
5.2 transaction_changes
Immutable-ish record of changes for audit and “explainability”.
id
agency_id
transaction_id UUID NOT NULL REFERENCES policy_transactions(id)
change_type TEXT NOT NULL CHECK (change_type IN ('add','update','remove'))
target_type TEXT NOT NULL CHECK (target_type IN ('policy_field','exposure','document','other'))
target_ref TEXT NOT NULL
before_json JSONB NULL
after_json JSONB NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, transaction_id) WHERE deleted_at IS NULL
6. Service Center (Cases, Tasks, Timeline)
6.1 service_cases
Primary work container; renewals live here but can link to transactions.
id
agency_id
case_type TEXT NOT NULL CHECK (case_type IN ('endorsement','renewal','coi','claim','billing','cancellation','sales','marketing','other'))
status TEXT NOT NULL CHECK (status IN ('open','in_progress','waiting','done','closed'))
priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent'))
account_id UUID NULL REFERENCES accounts(id)
policy_id UUID NULL REFERENCES policies(id)
policy_term_id UUID NULL REFERENCES policy_terms(id)
transaction_id UUID NULL REFERENCES policy_transactions(id)
assigned_to_user_id UUID NULL REFERENCES users(id)
due_date DATE NULL
sla_due_at TIMESTAMPTZ NULL
title TEXT NOT NULL
dedupe_key TEXT NULL (automation safe)
created_at, updated_at, deleted_at
Indexes:
(agency_id, status) WHERE deleted_at IS NULL
(agency_id, assigned_to_user_id) WHERE deleted_at IS NULL
(agency_id, due_date) WHERE deleted_at IS NULL
UNIQUE (agency_id, dedupe_key) WHERE deleted_at IS NULL AND dedupe_key IS NOT NULL
6.2 tasks
Actionable items (not the whole timeline).
id
agency_id
status TEXT NOT NULL CHECK (status IN ('open','completed'))
title TEXT NOT NULL
description TEXT NULL
due_date DATE NULL
assigned_to_user_id UUID NULL REFERENCES users(id)
created_by_user_id UUID NULL REFERENCES users(id)
linked_entity_type TEXT NULL
linked_entity_id UUID NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, status) WHERE deleted_at IS NULL
(agency_id, assigned_to_user_id) WHERE deleted_at IS NULL
6.3 activities (universal timeline)
Everything that happened, human or system.
id
agency_id
activity_type TEXT NOT NULL CHECK (activity_type IN ('note','call','email','meeting','system'))
entity_type TEXT NOT NULL
entity_id UUID NOT NULL
direction TEXT NULL CHECK (direction IN ('inbound','outbound'))
occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
content TEXT NULL
created_by_user_id UUID NULL REFERENCES users(id)
created_at, updated_at, deleted_at
Indexes:
(agency_id, entity_type, entity_id, occurred_at DESC) WHERE deleted_at IS NULL
7. Documents
7.1 documents
id
agency_id
file_name TEXT NOT NULL
mime_type TEXT NOT NULL
storage_key TEXT NOT NULL
uploaded_by_user_id UUID NULL REFERENCES users(id)
created_at, updated_at, deleted_at
Indexes:
(agency_id, created_at DESC) WHERE deleted_at IS NULL
7.2 document_links
id
agency_id
document_id UUID NOT NULL REFERENCES documents(id)
entity_type TEXT NOT NULL
entity_id UUID NOT NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, entity_type, entity_id) WHERE deleted_at IS NULL
8. COI (Certificates of Insurance)
8.1 certificate_holders
id
agency_id
account_id UUID NOT NULL REFERENCES accounts(id)
holder_name TEXT NOT NULL
holder_address TEXT NULL
holder_email TEXT NULL
created_at, updated_at, deleted_at
8.2 certificate_wording_library
id
agency_id
name TEXT NOT NULL
wording_text TEXT NOT NULL
requires_approval BOOLEAN NOT NULL DEFAULT false
created_at, updated_at, deleted_at
8.3 coi_requests
id
agency_id
account_id UUID NOT NULL REFERENCES accounts(id)
policy_id UUID NOT NULL REFERENCES policies(id)
holder_id UUID NOT NULL REFERENCES certificate_holders(id)
wording_id UUID NOT NULL REFERENCES certificate_wording_library(id)
status TEXT NOT NULL CHECK (status IN ('requested','needs_approval','approved','issued','declined'))
requested_by_user_id UUID NULL REFERENCES users(id)
approved_by_user_id UUID NULL REFERENCES users(id)
issued_document_id UUID NULL REFERENCES documents(id)
created_at, updated_at, deleted_at
9. Claims (v1 tracking)
9.1 claims
id
agency_id
account_id UUID NOT NULL REFERENCES accounts(id)
policy_id UUID NOT NULL REFERENCES policies(id)
loss_date DATE NOT NULL
status TEXT NOT NULL CHECK (status IN ('open','closed'))
carrier_claim_number TEXT NULL
summary TEXT NULL
adjuster_json JSONB NULL
created_at, updated_at, deleted_at
Indexes:
(agency_id, status) WHERE deleted_at IS NULL
10. Events (Automation & AI Foundation)
10.1 events
Immutable event stream for automation, analytics, and AI.
id
agency_id
event_type TEXT NOT NULL (e.g., policy.expiration_offset, service_case.created, consent.changed)
entity_type TEXT NOT NULL
entity_id UUID NOT NULL
actor_user_id UUID NULL REFERENCES users(id)
contact_id UUID NULL REFERENCES contacts(id)
request_id TEXT NULL
meta_json JSONB NOT NULL DEFAULT '{}'::jsonb
created_at, deleted_at
Indexes:
(agency_id, event_type, created_at DESC) WHERE deleted_at IS NULL
(agency_id, created_at DESC) WHERE deleted_at IS NULL
11. Automation Engine (Unified for AMS + Sales + Marketing)
11.1 automation_rules
id
agency_id
name TEXT NOT NULL
is_enabled BOOLEAN NOT NULL DEFAULT true
trigger_type TEXT NOT NULL
Examples:
POLICY_EXPIRATION_OFFSET
SERVICE_CASE_STATUS_CHANGED
CONTACT_CONSENT_CHANGED
(future) OPPORTUNITY_STAGE_CHANGED
trigger_config_json JSONB NOT NULL DEFAULT '{}'::jsonb
created_by_user_id UUID NULL REFERENCES users(id)
created_at, updated_at, deleted_at
Indexes:
(agency_id, trigger_type) WHERE deleted_at IS NULL
11.2 automation_actions
id
agency_id
rule_id UUID NOT NULL REFERENCES automation_rules(id)
action_order INT NOT NULL DEFAULT 1
action_type TEXT NOT NULL
Examples:
CREATE_CASE
CREATE_TASK
(future) SEND_EMAIL
(future) ADD_TO_CAMPAIGN
action_config_json JSONB NOT NULL DEFAULT '{}'::jsonb
created_at, updated_at, deleted_at
Constraints:
UNIQUE (agency_id, rule_id, action_order) WHERE deleted_at IS NULL
11.3 automation_runs
id
agency_id
rule_id UUID NOT NULL REFERENCES automation_rules(id)
status TEXT NOT NULL CHECK (status IN ('started','skipped','succeeded','failed'))
started_at TIMESTAMPTZ NOT NULL DEFAULT now()
finished_at TIMESTAMPTZ NULL
result_json JSONB NOT NULL DEFAULT '{}'::jsonb
created_at, updated_at, deleted_at
11.4 automation_dedupes
Guaranteed idempotency keyspace per agency.
id
agency_id
dedupe_key TEXT NOT NULL
created_at, updated_at, deleted_at
Constraints:
UNIQUE (agency_id, dedupe_key) WHERE deleted_at IS NULL
12. Audit Log (Mandatory)
12.1 audit_log
id
agency_id
actor_user_id UUID NULL REFERENCES users(id)
action TEXT NOT NULL
entity_type TEXT NOT NULL
entity_id UUID NOT NULL
before_json JSONB NULL
after_json JSONB NULL
request_id TEXT NULL
ip_address TEXT NULL
user_agent TEXT NULL
created_at, deleted_at
Indexes:
(agency_id, entity_type, created_at DESC) WHERE deleted_at IS NULL
(agency_id, created_at DESC) WHERE deleted_at IS NULL
13. Renewal Cadence Standard (Spec Requirement)
Saturate ships with a default renewal cadence (configurable per agency via automation rules):
Offsets: 120 / 90 / 60 / 30 / 14 / 7 / 1 days before term expiration
Default priorities:
120: low
90: low
60: normal
30: normal
14: high
7: high
1: high
Implementation MUST be idempotent and deduped via service_cases.dedupe_key and/or automation_dedupes.
14. Sales CRM (Future-Proof Placeholder)
Not required for v2 migrations yet, but architecture is reserved:
leads
opportunities
pipelines
pipeline_stages
All must plug into activities, events, and automation_rules.