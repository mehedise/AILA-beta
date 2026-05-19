import {
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const importStatusEnum = [
  "uploaded",
  "processing",
  "ready_for_review",
  "completed",
  "failed",
] as const;

export const sourceTypeEnum = ["xlsx", "pdf"] as const;

export const reviewStatusEnum = ["pending", "approved", "rejected"] as const;

export const enrichmentStatusEnum = [
  "pending",
  "enriched",
  "failed",
  "skipped",
] as const;

export const imports = pgTable("imports", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  sourceType: text("source_type", { enum: sourceTypeEnum }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: text("file_name").notNull(),
  fileKey: text("file_key").notNull(),
  status: text("status", { enum: importStatusEnum })
    .notNull()
    .default("uploaded"),
  totalItems: integer("total_items").default(0).notNull(),
  processedItems: integer("processed_items").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const extractedLeads = pgTable("extracted_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  importId: uuid("import_id")
    .references(() => imports.id, { onDelete: "cascade" })
    .notNull(),
  pageNumber: integer("page_number"),
  cardImageUrl: text("card_image_url"),
  rawText: text("raw_text"),
  rawJson: jsonb("raw_json"),

  // Person
  name: text("name"),
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),

  // Company
  company: text("company"),

  // Contact
  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  website: text("website"),
  logoUrl: text("logo_url"),

  // Location
  address: text("address"),
  city: text("city"),
  zipCode: text("zip_code"),
  country: text("country"),

  // Firmographics
  annualRevenue: text("annual_revenue"),
  employeeHeadcount: text("employee_headcount"),

  // GICS
  gicsSector: text("gics_sector"),
  gicsSectorCode: text("gics_sector_code"),
  gicsIndustryGroup: text("gics_industry_group"),
  gicsIndustryGroupCode: text("gics_industry_group_code"),
  gicsIndustry: text("gics_industry"),
  gicsIndustryCode: text("gics_industry_code"),
  gicsSubIndustry: text("gics_sub_industry"),
  gicsSubIndustryCode: text("gics_sub_industry_code"),
  gicsSubIndustryDescription: text("gics_sub_industry_description"),
  gicsClassificationKey: text("gics_classification_key"),
  industry: text("industry"),
  industryCode: text("industry_code"),

  // Quality
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  fieldConfidence: jsonb("field_confidence"),
  issues: jsonb("issues"),
  extractionMethod: text("extraction_method"),
  verificationModel: text("verification_model"),

  // Enrichment
  enrichmentStatus: text("enrichment_status", { enum: enrichmentStatusEnum })
    .notNull()
    .default("pending"),
  enrichmentJson: jsonb("enrichment_json"),

  reviewStatus: text("review_status", { enum: reviewStatusEnum })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),

  name: text("name"),
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  title: text("title"),

  company: text("company"),

  email: text("email"),
  phone: text("phone"),
  mobile: text("mobile"),
  website: text("website"),
  logoUrl: text("logo_url"),

  address: text("address"),
  city: text("city"),
  zipCode: text("zip_code"),
  country: text("country"),

  annualRevenue: text("annual_revenue"),
  employeeHeadcount: text("employee_headcount"),

  gicsSector: text("gics_sector"),
  gicsSectorCode: text("gics_sector_code"),
  gicsIndustryGroup: text("gics_industry_group"),
  gicsIndustryGroupCode: text("gics_industry_group_code"),
  gicsIndustry: text("gics_industry"),
  gicsIndustryCode: text("gics_industry_code"),
  gicsSubIndustry: text("gics_sub_industry"),
  gicsSubIndustryCode: text("gics_sub_industry_code"),
  gicsSubIndustryDescription: text("gics_sub_industry_description"),
  gicsClassificationKey: text("gics_classification_key"),
  industry: text("industry"),
  industryCode: text("industry_code"),

  enrichmentStatus: text("enrichment_status", { enum: enrichmentStatusEnum }),
  enrichmentJson: jsonb("enrichment_json"),

  sourceExtractedLeadId: uuid("source_extracted_lead_id").references(
    () => extractedLeads.id,
    { onDelete: "set null" }
  ),
  dedupeKey: text("dedupe_key").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;
export type ExtractedLead = typeof extractedLeads.$inferSelect;
export type NewExtractedLead = typeof extractedLeads.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
