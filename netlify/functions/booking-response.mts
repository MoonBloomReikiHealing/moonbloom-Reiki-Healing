import type { Config, Context } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings, type Booking } from "../../db/schema.js";
import { createCalendarEvent } from "./_lib/calendar.mjs";
import { requireEnv } from "./_lib/config.mjs";
import { customerDecisionEmail, sendEmail } from "./_lib/email.mjs";
import { escapeHtml, sha256 } from "./_lib/security.mjs";

type Decision = "confirm" | "decline";

function page(title: string, content: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · MoonBloom</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#30264a,#171226 70%);font-family:Arial,sans-serif;color:#241d35}.card{width:min(100%,620px);padding:42px;background:#fffafc;border:1px solid #d9c9e7;border-radius:24px;box-shadow:0 24px 80px #0d0919}.eyebrow{margin:0 0 10px;color:#8267aa;font-size:12px;letter-spacing:2px;text-transform:uppercase}h1{margin:0 0 18px;font:normal 38px/1.05 Georgia,serif}p{line-height:1.65;color:#655b70}.details{margin:26px 0;padding:20px;border-radius:14px;background:#f3edf7}.details p{margin:5px 0;color:#3c3348}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}button,a.button{appearance:none;border:0;border-radius:999px;padding:13px 22px;background:#8066a8;color:#fff;font:600 15px Arial,sans-serif;text-decoration:none;cursor:pointer}.decline{background:#8d5563}a.secondary{color:#6f598d}small{display:block;margin-top:20px;color:#867c8e}@media(max-width:520px){.card{padding:30px 24px}h1{font-size:32px}}</style></head><body><main class="card">${content}</main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function validDecision(value: string | null): value is Decision {
  return value === "confirm" || value === "decline";
}

async function bookingForToken(token: string): Promise<Booking | undefined> {
  const tokenHash = await sha256(token);
  const [booking] = await db.select().from(bookings).where(eq(bookings.responseTokenHash, tokenHash)).limit(1);
  return booking;
}

function bookingDetails(booking: Booking): string {
  return `<div class="details"><p><strong>${escapeHtml(booking.customerName)}</strong></p><p>${escapeHtml(booking.sessionName)}</p><p>${escapeHtml(booking.preferredDate)} at ${escapeHtml(booking.preferredTime)}</p><p>${escapeHtml(booking.customerTimeZoneLabel || booking.customerTimeZone)} (${escapeHtml(booking.customerTimeZone)})</p></div>`;
}

function completedPage(booking: Booking): Response {
  if (booking.status === "confirmed") {
    return page("Booking confirmed", `<p class="eyebrow">MoonBloom booking</p><h1>Session confirmed</h1>${bookingDetails(booking)}<p>The session is in your Google Calendar and the client has been notified.</p>`);
  }

  if (booking.status === "declined") {
    return page("Booking declined", `<p class="eyebrow">MoonBloom booking</p><h1>Request declined</h1>${bookingDetails(booking)}<p>The client has been notified that this time is unavailable.</p>`);
  }

  return page("Booking processing", `<p class="eyebrow">MoonBloom booking</p><h1>Confirmation in progress</h1><p>This booking is currently being added to the calendar. Refresh this page in a moment.</p>`, 202);
}

export default async (req: Request, context: Context) => {
  let token = "";
  let decision: string | null = null;

  if (req.method === "GET") {
    const url = new URL(req.url);
    token = url.searchParams.get("token") || "";
    decision = url.searchParams.get("decision");
  } else if (req.method === "POST") {
    const form = await req.formData();
    token = String(form.get("token") || "");
    decision = String(form.get("decision") || "");
  } else {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  if (!token || !validDecision(decision)) {
    return page("Invalid link", `<p class="eyebrow">MoonBloom booking</p><h1>This link is not valid</h1><p>Open the original booking email and try again.</p>`, 400);
  }

  const booking = await bookingForToken(token);

  if (!booking) {
    return page("Invalid link", `<p class="eyebrow">MoonBloom booking</p><h1>This link is not valid</h1><p>The response link could not be matched to a booking.</p>`, 404);
  }

  if (booking.responseTokenExpiresAt.getTime() < Date.now()) {
    return page("Link expired", `<p class="eyebrow">MoonBloom booking</p><h1>This link has expired</h1>${bookingDetails(booking)}<p>Booking response links remain active for 30 days.</p>`, 410);
  }

  if (booking.status !== "pending" && !(booking.status === "confirming" && decision === "confirm")) {
    return completedPage(booking);
  }

  if (req.method === "GET") {
    const actionLabel = decision === "confirm" ? "Confirm and add to calendar" : "Decline this request";
    const actionClass = decision === "decline" ? "decline" : "";
    return page("Review booking", `<p class="eyebrow">Review booking request</p><h1>${decision === "confirm" ? "Confirm this session?" : "Decline this request?"}</h1>${bookingDetails(booking)}<p>${decision === "confirm" ? "Confirming creates the event in your Google Calendar and emails the client." : "Declining emails the client that this requested time is unavailable."}</p><form method="post" action="/booking/respond"><input type="hidden" name="token" value="${escapeHtml(token)}"><input type="hidden" name="decision" value="${decision}"><div class="actions"><button class="${actionClass}" type="submit">${actionLabel}</button></div></form><small>No change is made until you press the button.</small>`);
  }

  if (decision === "decline") {
    const [declined] = await db.update(bookings).set({
      status: "declined",
      respondedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(bookings.id, booking.id), eq(bookings.status, "pending"))).returning();

    if (!declined) {
      const latest = await bookingForToken(token);
      return latest ? completedPage(latest) : page("Booking unavailable", "<h1>Booking unavailable</h1>", 409);
    }

    context.waitUntil(sendEmail({
      to: declined.customerEmail,
      subject: "An update on your MoonBloom booking request",
      replyTo: requireEnv("BOOKING_OWNER_EMAIL"),
      html: customerDecisionEmail(declined.customerName, false, declined.sessionName, declined.preferredDate, declined.preferredTime, declined.customerTimeZone),
    }).catch((error) => console.error("Unable to send decline email", error)));
    return completedPage(declined);
  }

  let confirming = booking;

  if (booking.status === "pending") {
    const [claimed] = await db.update(bookings).set({ status: "confirming", updatedAt: new Date() })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "pending"))).returning();

    if (!claimed) {
      const latest = await bookingForToken(token);
      return latest ? completedPage(latest) : page("Booking unavailable", "<h1>Booking unavailable</h1>", 409);
    }

    confirming = claimed;
  }

  try {
    const eventId = await createCalendarEvent(confirming);
    const [confirmed] = await db.update(bookings).set({
      status: "confirmed",
      calendarEventId: eventId,
      respondedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(bookings.id, confirming.id), eq(bookings.status, "confirming"))).returning();

    if (!confirmed) {
      const latest = await bookingForToken(token);
      return latest ? completedPage(latest) : page("Booking unavailable", "<h1>Booking unavailable</h1>", 409);
    }

    context.waitUntil(sendEmail({
      to: confirmed.customerEmail,
      subject: "Your MoonBloom session is confirmed",
      replyTo: requireEnv("BOOKING_OWNER_EMAIL"),
      html: customerDecisionEmail(confirmed.customerName, true, confirmed.sessionName, confirmed.preferredDate, confirmed.preferredTime, confirmed.customerTimeZone),
    }).catch((error) => console.error("Unable to send confirmation email", error)));
    return completedPage(confirmed);
  } catch (error) {
    await db.update(bookings).set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(bookings.id, confirming.id), eq(bookings.status, "confirming")));
    console.error("Unable to confirm booking", error);
    return page("Calendar unavailable", `<p class="eyebrow">MoonBloom booking</p><h1>The calendar could not be updated</h1>${bookingDetails(confirming)}<p>No confirmation was recorded. Check the calendar integration settings and try this link again.</p>`, 502);
  }
};

export const config: Config = {
  path: "/booking/respond",
  method: ["GET", "POST"],
};
