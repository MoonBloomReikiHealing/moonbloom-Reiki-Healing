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
        <a href="${escapeHtml(input.confirmUrl)}" style="display:inline-block;margin:0 10px 10px 0;padding:13px 22px;border-radius:999px;background:#8069a8;color:#fff;text-decoration:none;font-weight:bold">Confirm booking</a>
        <a href="${escapeHtml(input.declineUrl)}" style="display:inline-block;margin:0 10px 10px 0;padding:12px 22px;border:1px solid #a693bd;border-radius:999px;color:#5e4d75;text-decoration:none;font-weight:bold">Decline booking</a>
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

interface CustomerBookingDetails {
  name: string;
  session: string;
  date: string;
  time: string;
  timeZone: string;
  meetingUrl: string;
}

function customerEmailShell(title: string, content: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f7f2f8;font-family:Arial,sans-serif;color:#241d35">
  <div style="max-width:640px;margin:0 auto;padding:36px 20px">
    <div style="background:#fff;border:1px solid #e5dced;border-radius:18px;padding:32px">
      <p style="margin:0 0 8px;color:#8069a8;font-size:12px;letter-spacing:2px;text-transform:uppercase">MoonBloom Reiki Healing</p>
      <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:32px;font-weight:normal;line-height:1.2">${title}</h1>
      ${content}
    </div>
  </div>
</body></html>`;
}

export function customerConfirmationEmail(input: CustomerBookingDetails): string {
  const paragraphStyle = "margin:0 0 18px;line-height:1.75";
  const listItemStyle = "margin:0 0 12px;line-height:1.65";

  return customerEmailShell("Your MoonBloom Reiki Session is Confirmed 🌙", `
    <p style="${paragraphStyle}">Hi ${escapeHtml(input.name)},</p>
    <p style="${paragraphStyle}">Thank you for your booking! I'm so glad you're here, and I look forward to connecting with you for your distance Reiki session on ${escapeHtml(input.date)} at ${escapeHtml(input.time)} (${escapeHtml(input.timeZone)}).</p>
    <div style="margin:24px 0;padding:20px;border-radius:14px;background:#f3edf7;text-align:center">
      <p style="margin:0 0 14px;line-height:1.6"><strong>${escapeHtml(input.session)}</strong><br>Your Google Meet room is ready for the confirmed session.</p>
      <a href="${escapeHtml(input.meetingUrl)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#8069a8;color:#fff;text-decoration:none;font-weight:bold">Join Google Meet</a>
      <p style="margin:14px 0 0;font-size:12px;line-height:1.5"><a href="${escapeHtml(input.meetingUrl)}" style="color:#675080">${escapeHtml(input.meetingUrl)}</a></p>
    </div>
    <h2 style="margin:30px 0 14px;font-family:Georgia,serif;font-size:20px;font-weight:bold;letter-spacing:1px">A FEW THINGS TO PREPARE BEFORE OUR SESSION:</h2>
    <ul style="margin:0 0 24px;padding-left:24px">
      <li style="${listItemStyle}">🌿 <strong>Find a quiet, comfortable space</strong> — somewhere you won't be disturbed for the full session. Lying down or sitting comfortably both work well.</li>
      <li style="${listItemStyle}">📵 <strong>Silence your phone and minimise distractions</strong> — this time is for you to fully relax and receive.</li>
      <li style="${listItemStyle}">💧 <strong>Drink a glass of water beforehand</strong> — this supports your body as it processes the energy shift.</li>
      <li style="${listItemStyle}">🕯️ <strong>Set an intention (optional but powerful)</strong> — take a moment to think about what you'd like support with. You don't need to share it with me unless you'd like to.</li>
      <li style="${listItemStyle}">🧘 <strong>Get comfortable</strong> — cosy clothing, a blanket, dim lighting, or calming music can all help you settle in.</li>
      <li style="${listItemStyle}">📓 <strong>Have a notebook nearby</strong> — some clients like to jot down thoughts, feelings, or insights that arise during or after the session.</li>
    </ul>
    <h2 style="margin:30px 0 14px;font-family:Georgia,serif;font-size:20px;font-weight:bold;letter-spacing:1px">OPENING YOURSELF TO RECEIVE:</h2>
    <p style="${paragraphStyle}">It's important to open your energy so you can receive the maximum amount of flow. Visualise, feel, or sense roots growing down from you into the earth, your crown chakra opening at the top of your head, and a ball of light surrounding you — white, gold, or whatever colour feels good to you — expanding outward, ready to receive love and higher energy.</p>
    <p style="${paragraphStyle}">Curiosity is key. It's best to enter the session with no expectations. Trust that whatever you need in the moment will be given to you. Our limited human perception can never fully comprehend all that we are and all that we need — the energy is intelligent, filled with unconditional love, acceptance, and awe for all that you are. Trust it.</p>
    <p style="${paragraphStyle}">Let any sensations happen in the body without judgement — it's simply the energy moving, and it's always for your highest good. If something feels uncomfortable, it doesn't mean anything is wrong — it may just be a blockage shifting. The more open you can be, the better your experience will be.</p>
    <p style="${paragraphStyle}">Your mind might try to get involved, analysing or making sense of what you're feeling. When this happens, simply step out of the way — take a deep inhale, and exhale the breath (and the energy) down through your body to your feet, keeping your focus there. This will reground you — you'll see 😉</p>
    <h2 style="margin:30px 0 14px;font-family:Georgia,serif;font-size:20px;font-weight:bold;letter-spacing:1px">WHAT TO EXPECT:</h2>
    <p style="${paragraphStyle}">At the time of our session, simply relax in your space and allow. I'll be sending Reiki energy to you remotely — you may feel warmth, tingling, emotional release, or deep relaxation. Everyone experiences it differently, so let go of expectation and just allow whatever comes.</p>
    <p style="${paragraphStyle}">If you have any questions before our session, feel free to reply to this message. I'm here for you 💛</p>
    <p style="margin:28px 0 0;line-height:1.7">With love and light,<br><strong>Tamsin</strong><br>MoonBloom Reiki Healing<br><a href="https://moonbloomhealing.co.uk" style="color:#675080">moonbloomhealing.co.uk</a></p>
  `);
}

export function customerConfirmationText(input: CustomerBookingDetails): string {
  return `Hi ${input.name},

Thank you for your booking! I'm so glad you're here, and I look forward to connecting with you for your distance Reiki session on ${input.date} at ${input.time} (${input.timeZone}).

${input.session}
Google Meet: ${input.meetingUrl}

A FEW THINGS TO PREPARE BEFORE OUR SESSION:

🌿 Find a quiet, comfortable space — somewhere you won't be disturbed for the full session. Lying down or sitting comfortably both work well.
📵 Silence your phone and minimise distractions — this time is for you to fully relax and receive.
💧 Drink a glass of water beforehand — this supports your body as it processes the energy shift.
🕯️ Set an intention (optional but powerful) — take a moment to think about what you'd like support with. You don't need to share it with me unless you'd like to.
🧘 Get comfortable — cosy clothing, a blanket, dim lighting, or calming music can all help you settle in.
📓 Have a notebook nearby — some clients like to jot down thoughts, feelings, or insights that arise during or after the session.

OPENING YOURSELF TO RECEIVE:

It's important to open your energy so you can receive the maximum amount of flow. Visualise, feel, or sense roots growing down from you into the earth, your crown chakra opening at the top of your head, and a ball of light surrounding you — white, gold, or whatever colour feels good to you — expanding outward, ready to receive love and higher energy.

Curiosity is key. It's best to enter the session with no expectations. Trust that whatever you need in the moment will be given to you. Our limited human perception can never fully comprehend all that we are and all that we need — the energy is intelligent, filled with unconditional love, acceptance, and awe for all that you are. Trust it.

Let any sensations happen in the body without judgement — it's simply the energy moving, and it's always for your highest good. If something feels uncomfortable, it doesn't mean anything is wrong — it may just be a blockage shifting. The more open you can be, the better your experience will be.

Your mind might try to get involved, analysing or making sense of what you're feeling. When this happens, simply step out of the way — take a deep inhale, and exhale the breath (and the energy) down through your body to your feet, keeping your focus there. This will reground you — you'll see 😉

WHAT TO EXPECT:

At the time of our session, simply relax in your space and allow. I'll be sending Reiki energy to you remotely — you may feel warmth, tingling, emotional release, or deep relaxation. Everyone experiences it differently, so let go of expectation and just allow whatever comes.

If you have any questions before our session, feel free to reply to this message. I'm here for you 💛

With love and light,
Tamsin
MoonBloom Reiki Healing
moonbloomhealing.co.uk`;
}

export function customerDeclineEmail(name: string): string {
  return customerEmailShell("An update on your MoonBloom request", `<p style="margin:0 0 18px;line-height:1.7">Hello ${escapeHtml(name)},</p><p style="margin:0;line-height:1.7">Thank you for your request. Unfortunately, that session time is not available. Please reply to this email or submit another preferred time.</p>`);
}

export function customerDeclineText(name: string): string {
  return `Hello ${name},\n\nThank you for your request. Unfortunately, that session time is not available. Please reply to this email or submit another preferred time.`;
}
