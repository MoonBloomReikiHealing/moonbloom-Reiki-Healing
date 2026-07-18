export function requireEnv(name: string): string {
  const value = Netlify.env.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
