import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const bookings = pgTable(
  "bookings",
  {
    id: uuid().defaultRandom().primaryKey(),
    sourceSubmissionId: text("source_submission_id").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    sessionName: text("session_name").notNull(),
    preferredDate: text("preferred_date").notNull(),
    preferredTime: text("preferred_time").notNull(),
    customerTimeZone: text("customer_time_zone").notNull(),
    customerTimeZoneLabel: text("customer_time_zone_label"),
    message: text().notNull().default(""),
    status: text().notNull().default("pending"),
    responseTokenHash: text("response_token_hash").notNull(),
    responseTokenExpiresAt: timestamp("response_token_expires_at", { withTimezone: true }).notNull(),
    ownerNotificationSentAt: timestamp("owner_notification_sent_at", { withTimezone: true }),
    calendarEventId: text("calendar_event_id"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("bookings_source_submission_id_unique").on(table.sourceSubmissionId),
    uniqueIndex("bookings_response_token_hash_unique").on(table.responseTokenHash),
    index("bookings_status_idx").on(table.status),
  ],
);

export type Booking = typeof bookings.$inferSelect;
