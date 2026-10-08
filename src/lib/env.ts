function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See README.md.`);
  return value;
}

// NEXT_PUBLIC_* values must be read with literal property access so Next.js can inline them.
export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const supabaseAnonKey = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const supabaseServiceKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Public base URL used in QR codes and emailed sign-in links. */
export function siteUrl(fallbackOrigin?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  return (fromEnv || fallbackOrigin || "http://localhost:3000").replace(/\/$/, "");
}

/** Identifies this app to LRCLIB and OpenStreetMap, which both ask for it. */
export const USER_AGENT =
  process.env.APP_USER_AGENT || "live-band-requests (https://github.com/ahernandez4735/live-band-requests)";
