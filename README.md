# MoonBloom Reiki Healing

Static Netlify site with a managed booking approval workflow.

## Booking workflow

1. A client submits the `booking-request` Netlify Form.
2. The `submission-created` function stores the request in Netlify Database and sends the owner a private email with review links.
3. Confirm and decline links open a final review page so automated email scanners cannot accidentally change a booking.
4. Confirming creates the session in Google Calendar and emails the client. Declining emails the client that the requested time is unavailable.

## Required environment variables

Configure these for Functions runtime in Netlify project settings:

- `BOOKING_ACTION_SECRET`: a long random secret used to sign private response links.
- `BOOKING_OWNER_EMAIL`: the address that receives booking requests and client replies.
- `BOOKING_FROM_EMAIL`: a verified Resend sender, such as `MoonBloom <bookings@example.com>`.
- `RESEND_API_KEY`: API key for sending the actionable owner email and client status emails.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: email address of a Google Cloud service account with Calendar API access.
- `GOOGLE_PRIVATE_KEY`: private key belonging to that service account. Preserve its line breaks or use escaped `\n` characters.
- `GOOGLE_CALENDAR_ID`: ID of the calendar that receives confirmed sessions.

Share the destination Google Calendar with `GOOGLE_SERVICE_ACCOUNT_EMAIL` and grant permission to make changes to events. Enable the Google Calendar API for the service account's Google Cloud project. Verify the `BOOKING_FROM_EMAIL` domain or sender in Resend before accepting live bookings.

The existing generic Netlify form-submission email can be disabled after the custom email is working to avoid duplicate owner notifications.

## Local checks

Run `npm run check` for TypeScript validation. Database migrations are generated from `db/schema.ts` into `netlify/database/migrations/`.
