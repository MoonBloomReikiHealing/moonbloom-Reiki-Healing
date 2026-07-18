import type { Booking } from "../../../db/schema.js";
import { requireEnv } from "./config.mjs";

const encoder = new TextEncoder();

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function privateKeyBytes(pem: string): Uint8Array {
  const normalized = pem.replaceAll("\\n", "\n");
  const base64 = normalized.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function googleAccessToken(): Promise<string> {
  const clientEmail = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_PRIVATE_KEY");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = `${header}.${claims}`;
  const keyData = privateKeyBytes(privateKey).buffer as ArrayBuffer;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google authentication returned ${response.status}`);
  }

  const data = await response.json() as { access_token?: string };

  if (!data.access_token) {
    throw new Error("Google authentication did not return an access token");
  }

  return data.access_token;
}

function sessionDurationMinutes(sessionName: string): number {
  if (sessionName.includes("30 minutes")) return 30;
  if (sessionName.includes("90 minutes")) return 90;
  return 60;
}

function addMinutes(localDateTime: string, minutes: number): string {
  const date = new Date(`${localDateTime}:00.000Z`);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString().slice(0, 19);
}

async function calendarEventId(bookingId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(bookingId));
  return `moonbloom${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function createCalendarEvent(booking: Booking): Promise<string> {
  const calendarId = requireEnv("GOOGLE_CALENDAR_ID");
  const accessToken = await googleAccessToken();
  const eventId = await calendarEventId(booking.id);
  const start = `${booking.preferredDate}T${booking.preferredTime}:00`;
  const end = addMinutes(start, sessionDurationMinutes(booking.sessionName));
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: eventId,
        summary: `${booking.sessionName} — ${booking.customerName}`,
        description: [
          `Client: ${booking.customerName}`,
          `Email: ${booking.customerEmail}`,
          booking.message ? `Notes: ${booking.message}` : "",
        ].filter(Boolean).join("\n"),
        start: { dateTime: start, timeZone: booking.customerTimeZone },
        end: { dateTime: end, timeZone: booking.customerTimeZone },
      }),
    },
  );

  if (response.status !== 409 && !response.ok) {
    throw new Error(`Google Calendar returned ${response.status}`);
  }

  return eventId;
}
