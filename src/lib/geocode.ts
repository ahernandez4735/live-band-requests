import "server-only";
import { USER_AGENT } from "@/lib/env";

/**
 * Turns a venue address into coordinates with OpenStreetMap's Nominatim service.
 * Their usage policy allows light use (about one request per second) with an identifying
 * User-Agent; a band saving a gig is well within that.
 */
export async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ q: address, format: "json", limit: "1" });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const [hit] = (await res.json()) as { lat: string; lon: string }[];
    if (!hit) return null;
    return { lat: Number(hit.lat), lng: Number(hit.lon) };
  } catch {
    return null;
  }
}
