/** Lowercase, strip accents and punctuation. Mirrors normalize_text() in the database. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(name: string): string {
  return normalize(name).replace(/\s+/g, "-").slice(0, 40).replace(/-+$/, "");
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export type ParsedSong = { title: string; artist: string };

/**
 * Parses a pasted song list, one per line: "Title - Artist", "Title – Artist", "Title by Artist",
 * "Title, Artist" or a tab-separated row (as copied from a spreadsheet). Blank lines and
 * duplicates are dropped.
 */
export function parseSongList(input: string): ParsedSong[] {
  const seen = new Set<string>();
  const out: ParsedSong[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, "").trim();
    if (!line) continue;
    let title = line;
    let artist = "";
    const tab = line.split("\t").map((s) => s.trim()).filter(Boolean);
    const dash = line.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    const by = line.match(/^(.+?)\s+by\s+(.+)$/i);
    if (tab.length >= 2) [title, artist] = tab;
    else if (dash) [, title, artist] = dash;
    else if (by) [, title, artist] = by;
    else if (line.includes(",")) {
      const i = line.lastIndexOf(",");
      title = line.slice(0, i).trim();
      artist = line.slice(i + 1).trim();
    }
    title = title.slice(0, 200);
    artist = artist.slice(0, 200);
    const key = `${normalize(title)}|${normalize(artist)}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, artist });
  }
  return out;
}

export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t.slice(0, 30)),
    ),
  ).slice(0, 8);
}
