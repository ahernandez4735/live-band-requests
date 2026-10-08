import "server-only";
import { USER_AGENT } from "@/lib/env";
import { normalize } from "@/lib/text";

export type Lyrics = { plain: string | null; synced: string | null };

type LrclibTrack = {
  trackName: string;
  artistName: string;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

/**
 * Looks up lyrics on LRCLIB (https://lrclib.net), a free community lyrics database.
 * Its lyrics are not publisher-licensed: fine for now, but swap in a licensed provider
 * before charging for the product.
 */
export async function findLyrics(title: string, artist: string): Promise<Lyrics | null> {
  const params = new URLSearchParams({ track_name: title });
  if (artist) params.set("artist_name", artist);
  let res: Response;
  try {
    res = await fetch(`https://lrclib.net/api/search?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
      // Lyrics rarely change; cache lookups for a day so guests polling the Lyrics tab don't refetch.
      next: { revalidate: 86400 },
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const results = (await res.json()) as LrclibTrack[];
  const wantTitle = normalize(title);
  const wantArtist = normalize(artist);
  const usable = results.filter((r) => !r.instrumental && (r.plainLyrics || r.syncedLyrics));
  const best =
    usable.find((r) => normalize(r.trackName) === wantTitle && (!wantArtist || normalize(r.artistName) === wantArtist)) ??
    usable.find((r) => normalize(r.trackName) === wantTitle) ??
    null;
  if (!best) return null;
  return { plain: best.plainLyrics ?? stripTimestamps(best.syncedLyrics), synced: best.syncedLyrics };
}

function stripTimestamps(lrc: string | null): string | null {
  if (!lrc) return null;
  return lrc.replace(/^\[[^\]]*\]\s?/gm, "");
}
