import type { Config, Context } from "@netlify/edge-functions";

const EUROPEAN_COUNTRIES = new Set([
  "AD", "AL", "AM", "AT", "AX", "AZ", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK",
  "EE", "ES", "FI", "FO", "FR", "GE", "GI", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT",
  "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE",
  "SI", "SJ", "SK", "SM", "TR", "UA", "VA", "XK",
]);

const GBP_COUNTRIES = new Set(["GB", "GG", "IM", "JE"]);

function whatsappUrl(): string | null {
  const phoneNumber = Netlify.env.get("WHATSAPP_NUMBER")?.replace(/\D/g, "");

  if (!phoneNumber) return null;

  const message = encodeURIComponent("Hello MoonBloom, I'd like to ask about a Reiki session.");
  return `https://wa.me/${phoneNumber}?text=${message}`;
}

export default (_req: Request, context: Context) => {
  const countryCode = context.geo.country?.code?.toUpperCase() || "";
  const currency = !GBP_COUNTRIES.has(countryCode) && EUROPEAN_COUNTRIES.has(countryCode) ? "EUR" : "GBP";

  return Response.json(
    { countryCode, currency, whatsappUrl: whatsappUrl() },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
};

export const config: Config = {
  path: "/api/pricing-region",
  method: "GET",
};
