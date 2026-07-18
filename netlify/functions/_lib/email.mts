import { requireEnv } from "./config.mjs";
import { escapeHtml } from "./security.mjs";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("BOOKING_FROM_EMAIL");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [options.to],
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.replyTo,
    }),
  });

  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}`);
  }
}

export function ownerBookingEmail(input: {
  name: string;
  email: string;
  session: string;
  date: string;
  time: string;
  timeZone: string;
  timeZoneLabel: string;
  message: string;
  confirmUrl: string;
  declineUrl: string;
}): string {
  const clientEmailAddress = encodeURIComponent(input.email).replace("%40", "@");
  const clientEmailSubject = encodeURIComponent(`Your MoonBloom ${input.session} booking request`);
  const clientEmailBody = encodeURIComponent(`Hello ${input.name},\n\nThank you for your booking request for ${input.session} on ${input.date} at ${input.time}.\n\n`);
  const clientEmailUrl = `mailto:${clientEmailAddress}?subject=${clientEmailSubject}&body=${clientEmailBody}`;
  const note = input.message
    ? `<tr><td style="padding:8px 0;color:#6f657e;vertical-align:top">Notes</td><td style="padding:8px 0 8px 20px">${escapeHtml(input.message).replaceAll("\n", "<br>")}</td></tr>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f7f2f8;font-family:Arial,sans-serif;color:#241d35">
  <div style="max-width:620px;margin:0 auto;padding:36px 20px">
    <div style="background:#fff;border:1px solid #e5dced;border-radius:18px;padding:32px">
      <p style="margin:0 0 8px;color:#8069a8;font-size:12px;letter-spacing:2px;text-transform:uppercase">MoonBloom booking request</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-weight:normal;font-size:32px">A new session is waiting</h1>
      <table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5">
        <tr><td style="padding:8px 0;color:#6f657e">Client</td><td style="padding:8px 0 8px 20px">${escapeHtml(input.name)}</td></tr>
        <tr><td style="padding:8px 0;color:#6f657e">Email</td><td style="padding:8px 0 8px 20px"><a href="${escapeHtml(clientEmailUrl)}" style="color:#675080">${escapeHtml(input.email)}</a></td></tr>
        <tr><td style="padding:8px 0;color:#6f657e">Session</td><td style="padding:8px 0 8px 20px">${escapeHtml(input.session)}</td></tr>
        <tr><td style="padding:8px 0;color:#6f657e">Requested time</td><td style="padding:8px 0 8px 20px">${escapeHtml(input.date)} at ${escapeHtml(input.time)}</td></tr>
        <tr><td style="padding:8px 0;color:#6f657e">Time zone</td><td style="padding:8px 0 8px 20px">${escapeHtml(input.timeZoneLabel || input.timeZone)} (${escapeHtml(input.timeZone)})</td></tr>
        ${note}
      </table>
      <div style="padding-top:28px">
        <a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;margin:0 10px 10px 0;padding:13px 22px;border-radius:999px;background:#8069a8;color:#fff;text-decoration:none;font-weight:bold">Review &amp; confirm</a>
        <a href="${escapeHtml(input.declineUrl)}" style="display:inline-block;margin:0 10px 10px 0;padding:12px 22px;border:1px solid #a693bd;border-radius:999px;color:#5e4d75;text-decoration:none;font-weight:bold">Review &amp; decline</a>
        <a href="${escapeHtml(clientEmailUrl)}" style="display:inline-block;margin:0 0 10px;padding:12px 22px;border:1px solid #6f8a7d;border-radius:999px;color:#405d50;text-decoration:none;font-weight:bold">Email client</a>
      </div>
      <p style="margin:18px 0 0;color:#786f82;font-size:12px;line-height:1.5">For safety, the email button opens a final review page before changing the booking.</p>
      <p style="margin:10px 0 0;color:#786f82;font-size:12px;line-height:1.5">If a button is hidden by your email app, use these links: <a href="${escapeHtml(input.confirmUrl)}">confirm booking</a> · <a href="${escapeHtml(input.declineUrl)}">decline booking</a> · <a href="${escapeHtml(clientEmailUrl)}">email ${escapeHtml(input.name)}</a>.</p>
    </div>
  </div>
</body></html>`;
}

export function ownerBookingText(input: {
  name: string;
  email: string;
  session: string;
  date: string;
  time: string;
  timeZone: string;
  timeZoneLabel: string;
  message: string;
  confirmUrl: string;
  declineUrl: string;
}): string {
  const notes = input.message ? `\nNotes: ${input.message}\n` : "";

  return `New MoonBloom booking request

Client: ${input.name}
Email: ${input.email}
Session: ${input.session}
Requested time: ${input.date} at ${input.time}
Time zone: ${input.timeZoneLabel || input.timeZone} (${input.timeZone})
${notes}
Review and confirm: ${input.confirmUrl}
Review and decline: ${input.declineUrl}

To email the client directly, reply to this message or write to ${input.email}.`;
}

export function customerDecisionEmail(name: string, confirmed: boolean, session: string, date: string, time: string, timeZone: string): string {
  const heading = confirmed ? "Your MoonBloom session is confirmed" : "An update on your MoonBloom request";
  const message = confirmed
    ? `Your ${escapeHtml(session)} session is booked for ${escapeHtml(date)} at ${escapeHtml(time)} (${escapeHtml(timeZone)}). You’ll receive the remaining session and payment details separately.`
    : "Thank you for your request. Unfortunately, that session time is not available. Please reply to this email or submit another preferred time.";

  return `<!doctype html><html><body style="margin:0;background:#f7f2f8;font-family:Arial,sans-serif;color:#241d35"><div style="max-width:600px;margin:0 auto;padding:36px 20px"><div style="background:#fff;border:1px solid #e5dced;border-radius:18px;padding:32px"><p style="color:#8069a8;font-size:12px;letter-spacing:2px;text-transform:uppercase">MoonBloom Reiki Healing</p><h1 style="font-family:Georgia,serif;font-weight:normal">${heading}</h1><p style="line-height:1.7">Hello ${escapeHtml(name)},</p><p style="line-height:1.7">${message}</p></div></div></body></html>`;
}
