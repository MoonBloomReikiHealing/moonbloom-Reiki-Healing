import type { Config, Context } from "@netlify/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { bookings, type Booking } from "../../db/schema.js";
import { createCalendarEvent } from "./_lib/calendar.mjs";
import { requireEnv } from "./_lib/config.mjs";
import {
  customerConfirmationEmail,
  customerConfirmationText,
  customerDeclineEmail,
  customerDeclineText,
  sendEmail,
} from "./_lib/email.mjs";
import { escapeHtml, sha256 } from "./_lib/security.mjs";

type Decision = "confirm" | "decline";

function page(title: string, content: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · MoonBloom</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#30264a,#171226 70%);font-family:Arial,sans-serif;color:#241d35}.card{width:min(100%,620px);padding:42px;background:#fffafc;border:1px solid #d9c9e7;border-radius:24px;box-shadow:0 24px 80px #0d0919}.eyebrow{margin:0 0 10px;color:#8267aa;font-size:12px;letter-spacing:2px;text-transform:uppercase}h1{margin:0 0 18px;font:normal 38px/1.05 Georgia,serif}p{line-height:1.65;color:#655b70}.details{margin:26px 0;padding:20px;border-radius:14px;background:#f3edf7}.details p{margin:5px 0;color:#3c3348}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}button,a.button{appearance:none;border:0;border-radius:999px;padding:13px 22px;background:#8066a8;color:#fff;font:600 15px Arial,sans-serif;text-decoration:none;cursor:pointer}.decline{background:#8d5563}a.secondary{color:#6f598d}small{display:block;margin-top:20px;color:#867c8e}.whatsapp-contact{position:fixed;right:20px;bottom:20px;z-index:20;display:flex;align-items:center;gap:10px;color:#332942;text-decoration:none;transition:transform .2s}.whatsapp-prompt{position:relative;padding:11px 15px;border:1px solid #cbbbe0;border-radius:16px;background:#fffaf4;box-shadow:0 12px 34px #0d09192e;font-size:12px;font-weight:700;white-space:nowrap}.whatsapp-prompt:after{content:'';position:absolute;top:50%;right:-6px;width:10px;height:10px;border-top:1px solid #cbbbe0;border-right:1px solid #cbbbe0;background:#fffaf4;transform:translateY(-50%) rotate(45deg)}.whatsapp-icon{display:grid;width:54px;height:54px;place-items:center;border-radius:50%;background:#526d61;box-shadow:0 14px 38px #0d091942;color:#fff}.whatsapp-icon svg{width:26px;height:26px;fill:currentColor}.whatsapp-contact:hover,.whatsapp-contact:focus-visible{transform:translateY(-2px)}.whatsapp-contact:focus-visible{outline:3px solid #c9b8e8;outline-offset:3px}@media(max-width:520px){.card{padding:30px 24px}h1{font-size:32px}.whatsapp-contact{right:14px;bottom:14px}.whatsapp-prompt{padding:10px 12px;font-size:11px}.whatsapp-icon{width:50px;height:50px}}</style></head><body><main class="card">${content}</main><a class="whatsapp-contact" href="https://wa.me/447713388035?text=Hello%20MoonBloom%2C%20I%27d%20like%20to%20ask%20about%20a%20Reiki%20session." target="_blank" rel="noopener noreferrer" aria-label="Any questions, contact MoonBloom on WhatsApp"><span class="whatsapp-prompt">Any questions, click here</span><span class="whatsapp-icon"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.04 4.2A11.7 11.7 0 0 0 5.92 21.76L4.2 28l6.4-1.68A11.8 11.8 0 1 0 16.04 4.2Zm0 21.46c-1.72 0-3.4-.46-4.86-1.34l-.34-.2-3.8 1 1.02-3.7-.22-.36a9.74 9.74 0 1 1 8.2 4.6Zm5.34-7.3c-.3-.14-1.74-.86-2-1-.28-.1-.5-.14-.7.16-.2.3-.76 1-.94 1.2-.18.2-.36.22-.66.08-.3-.14-1.24-.46-2.36-1.46a8.9 8.9 0 0 1-1.64-2.04c-.18-.3-.02-.46.12-.6.14-.14.3-.36.44-.54.16-.18.2-.3.3-.5.1-.2.06-.38-.02-.54-.08-.14-.68-1.64-.94-2.24-.24-.6-.5-.52-.7-.52h-.58c-.2 0-.52.08-.8.38-.28.3-1.04 1.02-1.04 2.48s1.06 2.86 1.2 3.06c.16.2 2.08 3.18 5.04 4.46.7.3 1.26.48 1.68.62.7.22 1.34.2 1.86.12.56-.08 1.74-.72 1.98-1.4.24-.7.24-1.3.18-1.42-.08-.12-.28-.2-.58-.34Z"/></svg></span></a></body></html>`, {
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
      html: customerDeclineEmail(declined.customerName),
      text: customerDeclineText(declined.customerName),
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
    const confirmationDetails = {
      name: confirming.customerName,
      session: confirming.sessionName,
      date: confirming.preferredDate,
      time: confirming.preferredTime,
      timeZone: confirming.customerTimeZoneLabel || confirming.customerTimeZone,
    };

    await sendEmail({
      to: confirming.customerEmail,
      subject: "Your MoonBloom Reiki Session is Confirmed 🌙",
      replyTo: requireEnv("BOOKING_OWNER_EMAIL"),
      html: customerConfirmationEmail(confirmationDetails),
      text: customerConfirmationText(confirmationDetails),
    });

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

    return completedPage(confirmed);
  } catch (error) {
    await db.update(bookings).set({ status: "pending", updatedAt: new Date() })
      .where(and(eq(bookings.id, confirming.id), eq(bookings.status, "confirming")));
    console.error("Unable to confirm booking", error);
    return page("Confirmation unavailable", `<p class="eyebrow">MoonBloom booking</p><h1>The booking could not be confirmed</h1>${bookingDetails(confirming)}<p>No confirmation was recorded. Check the calendar and email integration settings, then try this link again.</p>`, 502);
  }
};

export const config: Config = {
  path: "/booking/respond",
  method: ["GET", "POST"],
};
