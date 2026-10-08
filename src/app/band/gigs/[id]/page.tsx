import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBand } from "@/lib/band";
import type { Gig, GigPrivate, Song } from "@/lib/types";
import { GigForm } from "../GigForm";
import { GigStatusControls, JoinCode, TonightSongs } from "./GigControls";

export const metadata: Metadata = { title: "Gig" };

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

export default async function GigPage({ params, searchParams }: PageProps<"/band/gigs/[id]">) {
  const { id } = await params;
  const { located } = await searchParams;
  const { supabase, band } = await requireBand();
  const [{ data: gig }, { data: priv }, { data: songs }, { data: off }] = await Promise.all([
    supabase.from("gigs").select("*").eq("id", id).eq("band_id", band.id).maybeSingle<Gig>(),
    supabase.from("gig_private").select("*").eq("gig_id", id).maybeSingle<GigPrivate>(),
    supabase.from("songs").select("id, title, artist").eq("band_id", band.id).order("title").returns<Pick<Song, "id" | "title" | "artist">[]>(),
    supabase.from("gig_song_off").select("song_id").eq("gig_id", id),
  ]);
  if (!gig || !priv) notFound();
  const offIds = new Set((off ?? []).map((o) => o.song_id));

  return (
    <main className="page stack" style={gap("24px")}>
      <div className="row between">
        <div className="stack" style={gap("4px")}>
          <p className="eyebrow">{gig.status === "live" ? "Live now" : gig.status === "ended" ? "Ended" : "Upcoming gig"}</p>
          <h1>{gig.name}</h1>
        </div>
        {gig.status === "live" ? (
          <Link className="btn btn-primary btn-big" href={`/band/gigs/${gig.id}/live`}>
            Open live dashboard
          </Link>
        ) : null}
      </div>

      {located === "0" ? (
        <p className="error">We couldn&apos;t find that address on the map. At the venue, open this page and tap &quot;Use this device&apos;s location&quot;, or guests can join with the code.</p>
      ) : null}
      {priv.lat == null && located !== "0" ? (
        <p className="error">No venue location yet, so guests can only join with the 4-digit code. Add an address or use this device&apos;s location.</p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20, alignItems: "start" }}>
        <div style={{ gridColumn: "span 2" }}>
          <GigForm gig={gig} priv={priv} />
        </div>
        <div className="stack" style={gap("16px")}>
          <GigStatusControls gigId={gig.id} status={gig.status} />
          <JoinCode gigId={gig.id} code={priv.join_code} />
          <TonightSongs gigId={gig.id} songs={songs ?? []} offIds={[...offIds]} />
        </div>
      </div>
    </main>
  );
}
