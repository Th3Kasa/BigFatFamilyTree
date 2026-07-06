CREATE TYPE "public"."date_precision_type" AS ENUM('exact', 'year', 'decade', 'before', 'after', 'around');--> statement-breakpoint
CREATE TYPE "public"."event_source_type" AS ENUM('grandma_transcript', 'family_contribution', 'document', 'admin');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('birth', 'death', 'marriage', 'divorce', 'engagement', 'migration', 'education', 'notable_story', 'custom');--> statement-breakpoint
CREATE TYPE "public"."gender_type" AS ENUM('m', 'f', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."proposal_status_type" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."relationship_status_type" AS ENUM('current', 'divorced', 'widowed');--> statement-breakpoint
CREATE TYPE "public"."relationship_type" AS ENUM('spouse', 'adopted_by', 'raised_by', 'godparent');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"custom_label" text,
	"date_value" date,
	"date_precision" date_precision_type DEFAULT 'exact' NOT NULL,
	"location" text,
	"story_ar" text,
	"story_en" text,
	"audio_url" text,
	"source_transcript_id" uuid,
	"source_type" "event_source_type" DEFAULT 'admin' NOT NULL,
	"contributed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transcript_id" uuid NOT NULL,
	"proposed_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "proposal_status_type" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"given_ar" text,
	"given_en" text,
	"father_name_ar" text,
	"father_name_en" text,
	"grandfather_name_ar" text,
	"grandfather_name_en" text,
	"great_grandfather_name_ar" text,
	"great_grandfather_name_en" text,
	"family_name_ar" text,
	"family_name_en" text,
	"gender" "gender_type" DEFAULT 'unknown' NOT NULL,
	"father_id" uuid,
	"mother_id" uuid,
	"is_placeholder" boolean DEFAULT false NOT NULL,
	"photo_url" text,
	"notes_ar" text,
	"notes_en" text,
	"pos_x" double precision,
	"pos_y" double precision,
	"birth_date" text,
	"death_date" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "relationship_type" NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" "relationship_status_type" DEFAULT 'current' NOT NULL,
	"order_index" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationships_different_people" CHECK ("relationships"."person_a_id" != "relationships"."person_b_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"focal_person_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audio_url" text NOT NULL,
	"raw_text_ar" text,
	"segments" jsonb,
	"recorded_at" date,
	"recorded_with" uuid,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_transcript_id_transcripts_id_fk" FOREIGN KEY ("source_transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_proposals" ADD CONSTRAINT "extraction_proposals_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_father_id_people_id_fk" FOREIGN KEY ("father_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_mother_id_people_id_fk" FOREIGN KEY ("mother_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_person_a_id_people_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_person_b_id_people_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_focal_person_id_people_id_fk" FOREIGN KEY ("focal_person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_recorded_with_people_id_fk" FOREIGN KEY ("recorded_with") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;