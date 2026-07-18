CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source_submission_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"session_name" text NOT NULL,
	"preferred_date" text NOT NULL,
	"preferred_time" text NOT NULL,
	"customer_time_zone" text NOT NULL,
	"customer_time_zone_label" text,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_token_hash" text NOT NULL,
	"response_token_expires_at" timestamp with time zone NOT NULL,
	"owner_notification_sent_at" timestamp with time zone,
	"calendar_event_id" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_source_submission_id_unique" ON "bookings" ("source_submission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_response_token_hash_unique" ON "bookings" ("response_token_hash");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" ("status");