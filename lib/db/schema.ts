/**
 * Drizzle schema for the Neon (Postgres) database.
 *
 * Mirrors the current Supabase `public` tables so the migration is a swap of
 * the query layer, not a data-model change. Column *keys* are snake_case to
 * match the shapes the app already consumes (e.g. `given_en`, `pos_x`), so
 * downstream code (buildGraphElements, PersonInput, etc.) keeps working.
 *
 * Differences from the Supabase schema (see docs/NEON_MIGRATION.md):
 *  - No RLS (enforced in the app layer instead).
 *  - Author columns that referenced Supabase `profiles` are plain nullable
 *    text here; the Better Auth user table + role live in the auth schema
 *    added in Phase 3.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── Enums ───────────────────────────────────────────────────────────────────
export const genderType = pgEnum("gender_type", ["m", "f", "unknown"]);
export const relationshipType = pgEnum("relationship_type", [
  "spouse",
  "adopted_by",
  "raised_by",
  "godparent",
]);
export const relationshipStatusType = pgEnum("relationship_status_type", [
  "current",
  "divorced",
  "widowed",
]);
export const eventType = pgEnum("event_type", [
  "birth",
  "death",
  "marriage",
  "divorce",
  "engagement",
  "migration",
  "education",
  "notable_story",
  "custom",
]);
export const datePrecisionType = pgEnum("date_precision_type", [
  "exact",
  "year",
  "decade",
  "before",
  "after",
  "around",
]);
export const eventSourceType = pgEnum("event_source_type", [
  "grandma_transcript",
  "family_contribution",
  "document",
  "admin",
]);
export const proposalStatusType = pgEnum("proposal_status_type", [
  "pending",
  "approved",
  "rejected",
]);
export const userRole = pgEnum("user_role", ["admin", "editor", "viewer"]);

// ── people ──────────────────────────────────────────────────────────────────
export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  given_ar: text("given_ar"),
  given_en: text("given_en"),
  father_name_ar: text("father_name_ar"),
  father_name_en: text("father_name_en"),
  grandfather_name_ar: text("grandfather_name_ar"),
  grandfather_name_en: text("grandfather_name_en"),
  great_grandfather_name_ar: text("great_grandfather_name_ar"),
  great_grandfather_name_en: text("great_grandfather_name_en"),
  family_name_ar: text("family_name_ar"),
  family_name_en: text("family_name_en"),
  gender: genderType("gender").notNull().default("unknown"),
  father_id: uuid("father_id").references((): AnyPgColumn => people.id),
  mother_id: uuid("mother_id").references((): AnyPgColumn => people.id),
  is_placeholder: boolean("is_placeholder").notNull().default(false),
  photo_url: text("photo_url"),
  notes_ar: text("notes_ar"),
  notes_en: text("notes_en"),
  pos_x: doublePrecision("pos_x"),
  pos_y: doublePrecision("pos_y"),
  birth_date: text("birth_date"),
  death_date: text("death_date"),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── relationships ───────────────────────────────────────────────────────────
export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: relationshipType("type").notNull(),
    person_a_id: uuid("person_a_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    person_b_id: uuid("person_b_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    start_date: date("start_date"),
    end_date: date("end_date"),
    status: relationshipStatusType("status").notNull().default("current"),
    order_index: integer("order_index").notNull().default(1),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("relationships_different_people", sql`${t.person_a_id} != ${t.person_b_id}`)],
);

// ── transcripts ─────────────────────────────────────────────────────────────
export const transcripts = pgTable("transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  audio_url: text("audio_url").notNull(),
  raw_text_ar: text("raw_text_ar"),
  segments: jsonb("segments"),
  recorded_at: date("recorded_at"),
  recorded_with: uuid("recorded_with").references(() => people.id),
  // References the Better Auth user id (text) once auth lands in Phase 3.
  uploaded_by: text("uploaded_by"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── events ──────────────────────────────────────────────────────────────────
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  person_id: uuid("person_id")
    .notNull()
    .references(() => people.id, { onDelete: "cascade" }),
  type: eventType("type").notNull(),
  custom_label: text("custom_label"),
  date_value: date("date_value"),
  date_precision: datePrecisionType("date_precision").notNull().default("exact"),
  location: text("location"),
  story_ar: text("story_ar"),
  story_en: text("story_en"),
  audio_url: text("audio_url"),
  source_transcript_id: uuid("source_transcript_id").references(() => transcripts.id),
  source_type: eventSourceType("source_type").notNull().default("admin"),
  contributed_by: text("contributed_by"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── extraction_proposals ────────────────────────────────────────────────────
export const extractionProposals = pgTable("extraction_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  transcript_id: uuid("transcript_id")
    .notNull()
    .references(() => transcripts.id, { onDelete: "cascade" }),
  proposed_changes: jsonb("proposed_changes").notNull().default(sql`'[]'::jsonb`),
  confidence_notes: jsonb("confidence_notes").notNull().default(sql`'[]'::jsonb`),
  status: proposalStatusType("status").notNull().default("pending"),
  reviewed_by: text("reviewed_by"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── settings (single row, id = 1) ───────────────────────────────────────────
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  focal_person_id: uuid("focal_person_id").references(() => people.id),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
