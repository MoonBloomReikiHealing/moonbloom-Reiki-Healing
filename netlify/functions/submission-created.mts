import type { Context } from "@netlify/functions";
import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings } from "../../db/schema.js";
import { requireEnv } from "./_lib/config.mjs";
import { ownerBookingEmail, sendEmail } from "./_lib/email.mjs";
import { createBookingToken, sha256 } from "./_lib/security.mjs";

interface FormPayload {
  id?: string;
  form_name: string;
  data: Record<string, string>;
  created_at: string;
}

function parsedTimeZone(value: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return undefined;
  }
}

export default async (req: Request, context: Context) => {
  const { payload } = await req.json() as { payload: FormPayload };

  if (payload.form_name !== "booking-request") {
    return new Response("Ignored", { status: 200 });
  }

  const data = payload.data;
  const requiredFields = ["name", "email", "session", "preferred-date", "preferred-time"];

  if (requiredFields.some((field) => !data[field]?.trim())) {
    return new Response("Invalid booking submission", { status: 400 });
  }

  const sourceSubmissionId = payload.id || await sha256([
    payload.created_at,
    data.email,
    data["preferred-date"],
    data["preferred-time"],
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
    return new Response("OK");
  }

  const siteUrl = context.site.url || requireEnv("URL");
  const actionUrl = new URL("/booking/respond", siteUrl);
  actionUrl.searchParams.set("token", token);
  actionUrl.searchParams.set("decision", "confirm");
  const confirmUrl = actionUrl.toString();
  actionUrl.searchParams.set("decision", "decline");

  await sendEmail({
    to: requireEnv("BOOKING_OWNER_EMAIL"),
    subject: `Booking request from ${booking.customerName}`,
    replyTo: booking.customerEmail,
    html: ownerBookingEmail({
      name: booking.customerName,
      email: booking.customerEmail,
      session: booking.sessionName,
      date: booking.preferredDate,
      time: booking.preferredTime,
      timeZone: booking.customerTimeZone,
      timeZoneLabel: booking.customerTimeZoneLabel || booking.customerTimeZone,
      message: booking.message,
      confirmUrl,
      declineUrl: actionUrl.toString(),
    }),
  });

  await db.update(bookings).set({ ownerNotificationSentAt: new Date(), updatedAt: new Date() }).where(eq(bookings.id, booking.id));
  return new Response("OK");
};
