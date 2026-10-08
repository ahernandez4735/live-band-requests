"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireBand, requireUser } from "@/lib/band";
import { geocode } from "@/lib/geocode";
import { findLyrics } from "@/lib/lrclib";
import { normalize, parseSongList, parseTags, SLUG_PATTERN } from "@/lib/text";
import { messageFor } from "@/lib/errors";

export type FormState = { error?: string; message?: string };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const bandSchema = z.object({
  name: z.string().trim().min(1, "Add your band's name.").max(80),
  slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN, "Use 3–40 lowercase letters, numbers or dashes."),
  bio: optionalText(1000),
  members: optionalText(300),
  booking_email: optionalText(200),
  booking_phone: optionalText(40),
  website: optionalText(200),
  instagram: optionalText(100),
  request_policy: z.enum(["listed", "listed_artists", "any"]),
});

function fields(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
}

export async function saveBand(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const parsed = bandSchema.safeParse(fields(formData, Object.keys(bandSchema.shape)));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { data: existing } = await supabase.from("bands").select("id").eq("owner_id", user.id).maybeSingle();
  const { error } = existing
    ? await supabase.from("bands").update(parsed.data).eq("id", existing.id)
    : await supabase.from("bands").insert({ ...parsed.data, owner_id: user.id });
  if (error) {
    if (error.code === "23505") return { error: "That link is taken. Try another." };
    return { error: messageFor(error) };
  }
  revalidatePath("/band", "layout");
  if (!existing) redirect("/band/songs?welcome=1");
  return { message: "Saved." };
}

export async function setPolicy(policy: string) {
  const { supabase, band } = await requireBand();
  const parsed = z.enum(["listed", "listed_artists", "any"]).parse(policy);
  await supabase.from("bands").update({ request_policy: parsed }).eq("id", band.id);
  revalidatePath("/band/songs");
}

// --- Songs -----------------------------------------------------------------

export async function addSong(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, band } = await requireBand();
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const artist = String(formData.get("artist") ?? "").trim().slice(0, 200);
  const tags = parseTags(String(formData.get("tags") ?? ""));
  if (!title) return { error: "Add the song title." };
  const { data, error } = await supabase
    .from("songs")
    .insert({ band_id: band.id, title, artist, tags })
    .select("id")
    .single();
  if (error) return { error: error.code === "23505" ? "That song is already on your list." : messageFor(error) };
  await lookUpLyrics(supabase, [{ id: data.id, title, artist }]);
  revalidatePath("/band/songs");
  return { message: `Added ${title}.` };
}

export async function importSongs(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, band } = await requireBand();
  const parsed = parseSongList(String(formData.get("list") ?? ""));
  if (parsed.length === 0) return { error: "Paste one song per line, like: September - Earth, Wind & Fire" };
  if (parsed.length > 1000) return { error: "That's over 1,000 songs. Import them in smaller batches." };
  const { data: existing } = await supabase.from("songs").select("title, artist").eq("band_id", band.id);
  const have = new Set((existing ?? []).map((s) => `${normalize(s.title)}|${normalize(s.artist)}`));
  const fresh = parsed.filter((s) => !have.has(`${normalize(s.title)}|${normalize(s.artist)}`));
  if (fresh.length > 0) {
    const { error } = await supabase.from("songs").insert(fresh.map((s) => ({ ...s, band_id: band.id })));
    if (error) return { error: messageFor(error) };
  }
  revalidatePath("/band/songs");
  const skipped = parsed.length - fresh.length;
  return {
    message: `Added ${fresh.length} song${fresh.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} already on your list` : ""}. Use "Find lyrics" to fetch their lyrics.`,
  };
}

export async function deleteSong(songId: string) {
  const { supabase, band } = await requireBand();
  await supabase.from("songs").delete().eq("id", songId).eq("band_id", band.id);
  revalidatePath("/band/songs");
}

export async function updateSongTags(songId: string, tags: string) {
  const { supabase, band } = await requireBand();
  await supabase.from("songs").update({ tags: parseTags(tags) }).eq("id", songId).eq("band_id", band.id);
  revalidatePath("/band/songs");
}

type Supa = Awaited<ReturnType<typeof requireBand>>["supabase"];

async function lookUpLyrics(supabase: Supa, songs: { id: string; title: string; artist: string }[]) {
  for (const song of songs) {
    const found = await findLyrics(song.title, song.artist);
    await supabase
      .from("songs")
      .update(
        found
          ? { lyrics: found.plain, synced_lyrics: found.synced, lyrics_status: "found" }
          : { lyrics_status: "missing" },
      )
      .eq("id", song.id);
  }
}

/** Fetches lyrics for up to 15 unchecked songs per call, so one click never runs too long. */
export async function findMissingLyrics(): Promise<FormState> {
  const { supabase, band } = await requireBand();
  const { data } = await supabase
    .from("songs")
    .select("id, title, artist")
    .eq("band_id", band.id)
    .eq("lyrics_status", "unchecked")
    .limit(15);
  await lookUpLyrics(supabase, data ?? []);
  revalidatePath("/band/songs");
  return { message: `Checked ${data?.length ?? 0} songs.` };
}

export async function retryLyrics(songId: string) {
  const { supabase, band } = await requireBand();
  const { data } = await supabase.from("songs").select("id, title, artist").eq("id", songId).eq("band_id", band.id).single();
  if (data) await lookUpLyrics(supabase, [data]);
  revalidatePath("/band/songs");
}

export async function addArtist(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, band } = await requireBand();
  const name = String(formData.get("name") ?? "").trim().slice(0, 200);
  if (!name) return { error: "Type an artist name." };
  const { error } = await supabase.from("cover_artists").insert({ band_id: band.id, name });
  if (error && error.code !== "23505") return { error: messageFor(error) };
  revalidatePath("/band/songs");
  return {};
}

export async function removeArtist(artistId: string) {
  const { supabase, band } = await requireBand();
  await supabase.from("cover_artists").delete().eq("id", artistId).eq("band_id", band.id);
  revalidatePath("/band/songs");
}

// --- Gigs ------------------------------------------------------------------

const gigSchema = z.object({
  name: z.string().trim().min(1, "Name the gig, for example: Evelyn's 60th.").max(120),
  starts_at: z.string().trim().transform((v) => (v ? new Date(v).toISOString() : null)),
  ends_at: z.string().trim().transform((v) => (v ? new Date(v).toISOString() : null)),
  address: z.string().trim().max(300).transform((v) => v || null),
  lat: z.string().trim().transform((v) => (v ? Number(v) : null)),
  lng: z.string().trim().transform((v) => (v ? Number(v) : null)),
  radius_m: z.coerce.number().int().min(100).max(2000),
  shoutouts_enabled: z.string().optional().transform((v) => v !== "off"),
});

/** Coordinates from the form (set with "Use this device's location"), else geocoded from the address. */
async function resolveLocation(data: z.infer<typeof gigSchema>) {
  let { lat, lng } = data;
  if ((lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) && data.address) {
    const hit = await geocode(data.address);
    ({ lat, lng } = hit ?? { lat: null, lng: null });
  }
  return { lat, lng };
}

export async function createGig(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, band } = await requireBand();
  const parsed = gigSchema.safeParse(fields(formData, Object.keys(gigSchema.shape)));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const { lat, lng } = await resolveLocation(d);
  const { data: gig, error } = await supabase
    .from("gigs")
    .insert({
      band_id: band.id,
      name: d.name,
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      shoutouts_enabled: d.shoutouts_enabled,
    })
    .select("id")
    .single();
  if (error) return { error: messageFor(error) };
  const { error: privError } = await supabase
    .from("gig_private")
    .insert({ gig_id: gig.id, address: d.address, lat, lng, radius_m: d.radius_m });
  if (privError) {
    await supabase.from("gigs").delete().eq("id", gig.id);
    return { error: messageFor(privError) };
  }
  revalidatePath("/band");
  redirect(`/band/gigs/${gig.id}${lat == null && d.address ? "?located=0" : ""}`);
}

export async function updateGig(gigId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireBand();
  const parsed = gigSchema.safeParse(fields(formData, Object.keys(gigSchema.shape)));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  const { lat, lng } = await resolveLocation(d);
  const { error } = await supabase
    .from("gigs")
    .update({ name: d.name, starts_at: d.starts_at, ends_at: d.ends_at, shoutouts_enabled: d.shoutouts_enabled })
    .eq("id", gigId);
  if (error) return { error: messageFor(error) };
  const { error: privError } = await supabase
    .from("gig_private")
    .update({ address: d.address, lat, lng, radius_m: d.radius_m })
    .eq("gig_id", gigId);
  if (privError) return { error: messageFor(privError) };
  revalidatePath(`/band/gigs/${gigId}`);
  if (d.address && lat == null) {
    return { error: "Saved, but we couldn't find that address on the map. Use \"Use this device's location\" at the venue instead." };
  }
  return { message: "Saved." };
}

export async function setSongOff(gigId: string, songId: string, off: boolean) {
  const { supabase } = await requireBand();
  if (off) await supabase.from("gig_song_off").upsert({ gig_id: gigId, song_id: songId });
  else await supabase.from("gig_song_off").delete().eq("gig_id", gigId).eq("song_id", songId);
  revalidatePath(`/band/gigs/${gigId}`);
}

export async function setGigStatus(gigId: string, status: "draft" | "live" | "ended") {
  const { supabase } = await requireBand();
  const { error } = await supabase.rpc("band_set_gig_status", { p_gig: gigId, p_status: status });
  if (error) throw new Error(messageFor(error));
  revalidatePath("/band", "layout");
  if (status === "live") redirect(`/band/gigs/${gigId}/live`);
}

export async function newJoinCode(gigId: string) {
  const { supabase } = await requireBand();
  const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  await supabase.from("gig_private").update({ join_code: code }).eq("gig_id", gigId);
  revalidatePath(`/band/gigs/${gigId}`, "layout");
}

export async function deleteGig(gigId: string) {
  const { supabase } = await requireBand();
  await supabase.from("gigs").delete().eq("id", gigId);
  revalidatePath("/band");
  redirect("/band");
}

export async function signOut() {
  const { supabase } = await requireUser();
  await supabase.auth.signOut();
  redirect("/login");
}
