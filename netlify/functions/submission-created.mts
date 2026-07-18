import type { FormSubmittedEvent } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings } from "../../db/schema.js";
import { requireEnv } from "./_lib/config.mjs";
import { ownerBookingEmail, ownerBookingText, sendEmail } from "./_lib/email.mjs";
import { createBookingToken, sha256 } from "./_lib/security.mjs";

function parsedTimeZone(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return undefined;
  }
}

export const formSubmitted = async (event: FormSubmittedEvent) => {
  const data = event.data;

  if (data["form-name"] !== "booking-request") {
    return;
  }

  const requiredFields = ["name", "email", "session", "preferred-date", "preferred-time"];

  if (requiredFields.some((field) => !data[field]?.trim())) {
    throw new Error("Invalid booking submission");
  }

  const sourceSubmissionId = await sha256([
    data.name,
    data.email,
    data.session,
    data["preferred-date"],
    data["preferred-time"],
    data["time-zone"],
    data.message,
  ].join("|"));
  const token = await createBookingToken(sourceSubmissionId, requireEnv("BOOKING_ACTION_SECRET"));
  const tokenHash = await sha256(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  const timeZone = parsedTimeZone(data["time-zone"]) || parsedTimeZone(data["iana-time-zone"]) || "UTC";

  await db.insert(bookings).values({
    sourceSubmissionId,
    customerName: data.name.trim(),
    customerEmail: data.email.trim().toLowerCase(),
    sessionName: data.session.trim(),
    preferredDate: data["preferred-date"],
    preferredTime: data["preferred-time"],
    customerTimeZone: timeZone,
    customerTimeZoneLabel: data["time-zone"]?.trim() || timeZone,
    message: data.message?.trim() || "",
    responseTokenHash: tokenHash,
    responseTokenExpiresAt: expiresAt,
  }).onConflictDoNothing({ target: bookings.sourceSubmissionId });

  const [booking] = await db.select().from(bookings).where(eq(bookings.sourceSubmissionId, sourceSubmissionId)).limit(1);

  if (!booking || booking.ownerNotificationSentAt) {
    return;
  }

  const siteUrl = requireEnv("URL");
  const actionUrl = new URL("/booking/respond", siteUrl);
  actionUrl.searchParams.set("token", token);
  actionUrl.searchParams.set("decision", "confirm");
  const confirmUrl = actionUrl.toString();
  actionUrl.searchParams.set("decision", "decline");
  const declineUrl = actionUrl.toString();
  const emailContent = {
    name: booking.customerName,
    email: booking.customerEmail,
    session: booking.sessionName,
    date: booking.preferredDate,
    time: booking.preferredTime,
    timeZone: booking.customerTimeZone,
    timeZoneLabel: booking.customerTimeZoneLabel || booking.customerTimeZone,
    message: booking.message,
    confirmUrl,
    declineUrl,
  };

  await sendEmail({
    to: requireEnv("BOOKING_OWNER_EMAIL"),
    subject: `Booking request from ${booking.customerName}`,
    replyTo: booking.customerEmail,
    html: ownerBookingEmail(emailContent),
    text: ownerBookingText(emailContent),
  });

  await db.update(bookings).set({ ownerNotificationSentAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, booking.id));
};
