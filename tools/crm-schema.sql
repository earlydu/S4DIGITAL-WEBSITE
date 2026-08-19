-- s4digital CRM schema. Run once in the Supabase SQL editor.
-- The CRM talks to Postgres with the service role key from the server only.

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "email" text,
  "name" text,
  "password_hash" text,
  "pin_hash" text,
  "role" text,
  "token_version" integer,
  "active" integer,
  "created_at" text,
  "updated_at" text,
  "last_login_at" text
);
CREATE INDEX IF NOT EXISTS idx_users_email ON "users" ("email");

CREATE TABLE IF NOT EXISTS "settings" (
  "id" text PRIMARY KEY,
  "value" text,
  "updated_at" text
);


CREATE TABLE IF NOT EXISTS "companies" (
  "id" text PRIMARY KEY,
  "name" text,
  "sector" text,
  "sub_sector" text,
  "location" text,
  "postcode" text,
  "region" text,
  "areas_served" text,
  "website" text,
  "domain" text,
  "logo_url" text,
  "main_phone" text,
  "phone_key" text,
  "general_email" text,
  "linkedin_company" text,
  "instagram" text,
  "facebook" text,
  "employees" integer,
  "founded" integer,
  "years_trading" integer,
  "google_reviews" integer,
  "google_rating" double precision,
  "segment" text,
  "key_services" text,
  "established_evidence" text,
  "marketing_opportunity" text,
  "lead_quality" text,
  "source_urls" text,
  "source" text,
  "date_verified" text,
  "ask_for" text,
  "stage" text,
  "call_status" text,
  "closed_reason" text,
  "attempts" integer,
  "no_answer_count" integer,
  "last_contacted_at" text,
  "next_attempt_at" text,
  "next_follow_up_at" text,
  "est_mrr" double precision,
  "est_one_off" double precision,
  "probability" integer,
  "assigned_to" text,
  "notes" text,
  "excluded" integer,
  "exclusion_reason" text,
  "archived" integer,
  "is_seed" integer,
  "import_id" text,
  "search_blob" text,
  "created_at" text,
  "updated_at" text,
  "created_by" text
);
CREATE INDEX IF NOT EXISTS idx_companies_stage ON "companies" ("stage");
CREATE INDEX IF NOT EXISTS idx_companies_lead_quality ON "companies" ("lead_quality");
CREATE INDEX IF NOT EXISTS idx_companies_sector ON "companies" ("sector");
CREATE INDEX IF NOT EXISTS idx_companies_domain ON "companies" ("domain");
CREATE INDEX IF NOT EXISTS idx_companies_phone_key ON "companies" ("phone_key");
CREATE INDEX IF NOT EXISTS idx_companies_archived_excluded ON "companies" ("archived", "excluded");
CREATE INDEX IF NOT EXISTS idx_companies_next_attempt_at ON "companies" ("next_attempt_at");
CREATE INDEX IF NOT EXISTS idx_companies_is_seed ON "companies" ("is_seed");

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" text PRIMARY KEY,
  "company_id" text,
  "first_name" text,
  "last_name" text,
  "job_title" text,
  "direct_phone" text,
  "direct_email" text,
  "linkedin" text,
  "is_primary" integer,
  "archived" integer,
  "is_seed" integer,
  "notes" text,
  "created_at" text,
  "updated_at" text
);
CREATE INDEX IF NOT EXISTS idx_contacts_company_id ON "contacts" ("company_id");
CREATE INDEX IF NOT EXISTS idx_contacts_is_seed ON "contacts" ("is_seed");

CREATE TABLE IF NOT EXISTS "activities" (
  "id" text PRIMARY KEY,
  "company_id" text,
  "contact_id" text,
  "user_id" text,
  "type" text,
  "outcome" text,
  "note" text,
  "detail" text,
  "duration_s" integer,
  "recording_url" text,
  "transcript" text,
  "occurred_at" text,
  "created_at" text,
  "is_seed" integer
);
CREATE INDEX IF NOT EXISTS idx_activities_company_id ON "activities" ("company_id");
CREATE INDEX IF NOT EXISTS idx_activities_occurred_at ON "activities" ("occurred_at");
CREATE INDEX IF NOT EXISTS idx_activities_user_id ON "activities" ("user_id");
CREATE INDEX IF NOT EXISTS idx_activities_is_seed ON "activities" ("is_seed");

CREATE TABLE IF NOT EXISTS "follow_ups" (
  "id" text PRIMARY KEY,
  "company_id" text,
  "contact_id" text,
  "user_id" text,
  "due_date" text,
  "due_time" text,
  "kind" text,
  "note" text,
  "status" text,
  "completed_at" text,
  "created_at" text,
  "updated_at" text,
  "is_seed" integer
);
CREATE INDEX IF NOT EXISTS idx_follow_ups_due_date_status ON "follow_ups" ("due_date", "status");
CREATE INDEX IF NOT EXISTS idx_follow_ups_company_id ON "follow_ups" ("company_id");
CREATE INDEX IF NOT EXISTS idx_follow_ups_is_seed ON "follow_ups" ("is_seed");

CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" text PRIMARY KEY,
  "company_id" text,
  "contact_id" text,
  "service" text,
  "mrr" double precision,
  "one_off" double precision,
  "close_date" text,
  "probability" integer,
  "stage" text,
  "notes" text,
  "created_at" text,
  "updated_at" text,
  "is_seed" integer
);
CREATE INDEX IF NOT EXISTS idx_opportunities_company_id ON "opportunities" ("company_id");
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON "opportunities" ("stage");
CREATE INDEX IF NOT EXISTS idx_opportunities_is_seed ON "opportunities" ("is_seed");

CREATE TABLE IF NOT EXISTS "meetings" (
  "id" text PRIMARY KEY,
  "company_id" text,
  "contact_id" text,
  "date" text,
  "time" text,
  "kind" text,
  "notes" text,
  "created_at" text,
  "is_seed" integer
);
CREATE INDEX IF NOT EXISTS idx_meetings_company_id ON "meetings" ("company_id");
CREATE INDEX IF NOT EXISTS idx_meetings_date ON "meetings" ("date");
CREATE INDEX IF NOT EXISTS idx_meetings_is_seed ON "meetings" ("is_seed");

CREATE TABLE IF NOT EXISTS "exclusions" (
  "id" text PRIMARY KEY,
  "pattern" text,
  "reason" text,
  "created_at" text
);


CREATE TABLE IF NOT EXISTS "imports" (
  "id" text PRIMARY KEY,
  "filename" text,
  "user_id" text,
  "rows" integer,
  "added" integer,
  "updated" integer,
  "skipped" integer,
  "errors" text,
  "created_at" text
);
CREATE INDEX IF NOT EXISTS idx_imports_created_at ON "imports" ("created_at");

CREATE TABLE IF NOT EXISTS "email_templates" (
  "id" text PRIMARY KEY,
  "name" text,
  "subject" text,
  "body" text,
  "sort" integer,
  "created_at" text,
  "updated_at" text
);


CREATE TABLE IF NOT EXISTS "call_queue" (
  "id" text PRIMARY KEY,
  "day" text,
  "user_id" text,
  "company_id" text,
  "position" integer,
  "reason" text,
  "status" text,
  "completed_at" text,
  "created_at" text
);
CREATE INDEX IF NOT EXISTS idx_call_queue_day_user_id ON "call_queue" ("day", "user_id");
CREATE INDEX IF NOT EXISTS idx_call_queue_company_id ON "call_queue" ("company_id");

-- Deny everything that is not the service role.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "follow_ups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exclusions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "call_queue" ENABLE ROW LEVEL SECURITY;
