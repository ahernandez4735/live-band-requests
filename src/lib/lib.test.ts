import { describe, expect, it } from "vitest";
import { distanceMeters, isWithinGig } from "./geo";
import { normalize, parseSongList, parseTags, slugify, SLUG_PATTERN } from "./text";
import { sortQueue } from "./types";

describe("geo", () => {
  it("measures short distances", () => {
    // ~111 m per 0.001 degree of latitude
    expect(distanceMeters(37.77, -122.42, 37.771, -122.42)).toBeGreaterThan(105);
    expect(distanceMeters(37.77, -122.42, 37.771, -122.42)).toBeLessThan(118);
  });
  it("lets guests inside the radius in and keeps others out", () => {
    const gig = { lat: 37.77, lng: -122.42, radiusM: 150 };
    expect(isWithinGig(gig, { lat: 37.7705, lng: -122.42 })).toBe(true); // ~55 m
    expect(isWithinGig(gig, { lat: 37.775, lng: -122.42 })).toBe(false); // ~555 m
  });
  it("adds GPS accuracy as slack, capped at 150 m", () => {
    const gig = { lat: 37.77, lng: -122.42, radiusM: 150 };
    const at250m = { lat: 37.77225, lng: -122.42 };
    expect(isWithinGig(gig, { ...at250m, accuracyM: 0 })).toBe(false);
    expect(isWithinGig(gig, { ...at250m, accuracyM: 120 })).toBe(true);
    expect(isWithinGig(gig, { lat: 37.778, lng: -122.42, accuracyM: 5000 })).toBe(false); // ~890 m
  });
});

describe("text", () => {
  it("normalizes accents and punctuation like the database does", () => {
    expect(normalize("Tití Me Preguntó!")).toBe("titi me pregunto");
    expect(normalize("  Don't Stop  Believin' ")).toBe("don t stop believin");
  });
  it("makes valid slugs", () => {
    const s = slugify("The Night Shift!");
    expect(s).toBe("the-night-shift");
    expect(SLUG_PATTERN.test(s)).toBe(true);
    expect(SLUG_PATTERN.test("-bad")).toBe(false);
  });
  it("parses pasted song lists in common formats", () => {
    const list = parseSongList(
      [
        "1. September - Earth, Wind & Fire",
        "Dancing Queen – ABBA",
        "Valerie by Amy Winehouse",
        "La Bamba\tRitchie Valens",
        "Suavemente, Elvis Crespo",
        "Happy Birthday",
        "",
        "september - earth, wind & fire",
      ].join("\n"),
    );
    expect(list).toEqual([
      { title: "September", artist: "Earth, Wind & Fire" },
      { title: "Dancing Queen", artist: "ABBA" },
      { title: "Valerie", artist: "Amy Winehouse" },
      { title: "La Bamba", artist: "Ritchie Valens" },
      { title: "Suavemente", artist: "Elvis Crespo" },
      { title: "Happy Birthday", artist: "" },
    ]);
  });
  it("cleans tags", () => {
    expect(parseTags(" Dance, Slow ,dance,, Latin ")).toEqual(["Dance", "Slow", "dance", "Latin"]);
  });
});

describe("queue order", () => {
  it("puts the locked song first, then votes, then who asked first", () => {
    const items = [
      { id: "a", pinned: false, score: 3, created_at: "2026-10-01T20:00:00Z" },
      { id: "b", pinned: false, score: 5, created_at: "2026-10-01T20:05:00Z" },
      { id: "c", pinned: true, score: 1, created_at: "2026-10-01T20:10:00Z" },
      { id: "d", pinned: false, score: 3, created_at: "2026-10-01T19:59:00Z" },
    ];
    expect(sortQueue(items).map((i) => i.id)).toEqual(["c", "b", "d", "a"]);
  });
});
