import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestSession } from "@/lib/guest-session";
import { loadGuestQueue } from "@/lib/guest-data";
import type { Band } from "@/lib/types";
import { GuestApp } from "./GuestApp";

export const metadata: Metadata = { title: "Request a song" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function GuestPage({ params }: PageProps<"/g/[gigId]">) {
  const { gigId } = await params;
  if (!UUID.test(gigId)) notFound();
  const db = createAdminClient();
  const { data: gig } = await db.from("gigs").select("id, name, band_id, status").eq("id", gigId).maybeSingle();
  if (!gig) notFound();
  const { data: band } = await db.from("bands").select("*").eq("id", gig.band_id).single<Band>();
  if (!band) notFound();
  const session = await getGuestSession(gigId);
  if (!session || gig.status !== "live") redirect(`/b/${band.slug}`);

  const [{ data: songs }, { data: off }, { data: artists }, queue] = await Promise.all([
    db.from("songs").select("id, title, artist, tags").eq("band_id", band.id).order("title"),
    db.from("gig_song_off").select("song_id").eq("gig_id", gigId),
    db.from("cover_artists").select("name").eq("band_id", band.id).order("name"),
    loadGuestQueue(gigId, session.id),
  ]);
  const offIds = new Set((off ?? []).map((o) => o.song_id));
  const available = (songs ?? []).filter((s) => !offIds.has(s.id));

  return (
    <GuestApp
      gigId={gigId}
      gigName={gig.name}
      band={band}
      songs={available}
      artists={(artists ?? []).map((a) => a.name)}
      initialQueue={queue!}
    />
  );
}
