-- Large PDF import scalability
ALTER TABLE "imports" ADD COLUMN IF NOT EXISTS "processing_mode" text NOT NULL DEFAULT 'standard';
ALTER TABLE "imports" ADD COLUMN IF NOT EXISTS "file_size_bytes" integer;
ALTER TABLE "imports" ADD COLUMN IF NOT EXISTS "pages_prepared" integer NOT NULL DEFAULT 0;
ALTER TABLE "imports" ADD COLUMN IF NOT EXISTS "extraction_failures" integer NOT NULL DEFAULT 0;
ALTER TABLE "imports" ADD COLUMN IF NOT EXISTS "import_settings" jsonb;

CREATE TABLE IF NOT EXISTS "import_page_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "import_id" uuid NOT NULL REFERENCES "imports"("id") ON DELETE cascade,
  "start_page" integer NOT NULL,
  "end_page" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "import_bulk_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "import_id" uuid NOT NULL REFERENCES "imports"("id") ON DELETE cascade,
  "user_id" text NOT NULL,
  "job_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "params" jsonb,
  "result" jsonb,
  "processed_count" integer NOT NULL DEFAULT 0,
  "total_count" integer NOT NULL DEFAULT 0,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "extracted_leads_import_id_idx" ON "extracted_leads" ("import_id");
CREATE INDEX IF NOT EXISTS "extracted_leads_import_review_idx" ON "extracted_leads" ("import_id", "review_status");
CREATE INDEX IF NOT EXISTS "extracted_leads_import_enrichment_idx" ON "extracted_leads" ("import_id", "enrichment_status");
CREATE INDEX IF NOT EXISTS "extracted_leads_import_page_idx" ON "extracted_leads" ("import_id", "page_number");
CREATE INDEX IF NOT EXISTS "leads_user_id_created_idx" ON "leads" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "import_page_jobs_import_id_idx" ON "import_page_jobs" ("import_id");
CREATE INDEX IF NOT EXISTS "import_bulk_jobs_import_id_idx" ON "import_bulk_jobs" ("import_id");
