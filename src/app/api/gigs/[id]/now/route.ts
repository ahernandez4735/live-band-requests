import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestSession } from "@/lib/guest-session";
import { findLyrics } from "@/lib/lrclib";

/** The song playing now, its lyrics, and the shoutouts the band approved for it. */
export async function GET(_: Request, { params }: RouteContext<"/api/gigs/[id]/now">) {
  const { id } = await params;
  const session = await getGuestSession(id);
  if (!session) return NextResponse.json({ error: "not_joined" }, { status: 401 });
  const db = createAdminClient();
  const { data: gig } = await db.from("gigs").select("now_playing_item_id").eq("id", id).maybeSingle();
  if (!gig?.now_playing_item_id) return NextResponse.json({ now: null });
  const { data: item } = await db
    .from("queue_items")
    .select("id, title, artist, song_id")
    .eq("id", gig.now_playing_item_id)
    .single();
  if (!item) return NextResponse.json({ now: null });

  let lyrics: string | null = null;
  if (item.song_id) {
    const { data: song } = await db.from("songs").select("lyrics").eq("id", item.song_id).maybeSingle();
    lyrics = song?.lyrics ?? null;
  }
  if (!lyrics) lyrics = (await findLyrics(item.title, item.artist))?.plain ?? null;

  const { data: shouts } = await db
    .from("requests")
    .select("guest_name, shoutout")
    .eq("queue_item_id", item.id)
    .eq("shoutout_status", "approved");

  return NextResponse.json({
    now: {
      id: item.id,
      title: item.title,
      artist: item.artist,
      lyrics,
      shoutouts: (shouts ?? []).map((s) => ({ name: s.guest_name, text: s.shoutout })),
    },
  });
}
