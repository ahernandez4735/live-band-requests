import type { Metadata } from "next";
import Link from "next/link";
import { requireBand } from "@/lib/band";
import type { Song } from "@/lib/types";
import { AddSongForm, ArtistsPanel, ImportForm, LyricsButton, PolicyPicker, SongRow } from "./SongsClient";

export const metadata: Metadata = { title: "Songs" };

export default async function SongsPage({ searchParams }: PageProps<"/band/songs">) {
  const { supabase, band } = await requireBand();
  const [{ data: songs }, { data: artists }] = await Promise.all([
    supabase.from("songs").select("*").eq("band_id", band.id).order("title").returns<Song[]>(),
    supabase.from("cover_artists").select("id, name").eq("band_id", band.id).order("name"),
  ]);
  const { welcome } = await searchParams;
  const list = songs ?? [];
  const unchecked = list.filter((s) => s.lyrics_status === "unchecked").length;
  const withLyrics = list.filter((s) => s.lyrics_status === "found").length;

  return (
    <main className="page stack" style={{ "--gap": "24px" } as React.CSSProperties}>
      {welcome ? (
        <div className="notice" role="status">
          Your band is set up. Step 2 of 3: add your songs below. Pasting a list is the fastest way.
        </div>
      ) : null}
      <div className="row between">
        <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          <h1>Songs</h1>
          <p className="muted small">
            {list.length} songs · lyrics found for {withLyrics} (from LRCLIB)
          </p>
        </div>
        {welcome && list.length > 0 ? (
          <Link className="btn btn-primary" href="/band/gigs/new">
            Next: create your first gig
          </Link>
        ) : null}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 20, alignItems: "start" }}>
        <div className="stack" style={{ "--gap": "16px" } as React.CSSProperties}>
          <PolicyPicker policy={band.request_policy} />
          <ArtistsPanel artists={artists ?? []} policy={band.request_policy} />
          <AddSongForm />
          <ImportForm />
        </div>

        <section className="card stack" style={{ "--gap": "10px", gridColumn: "span 2" } as React.CSSProperties} aria-label="Your songs">
          <div className="row between">
            <h2>Your list</h2>
            {unchecked > 0 ? <LyricsButton remaining={unchecked} /> : null}
          </div>
          {list.length === 0 ? (
            <p className="muted">No songs yet. Add one, or paste your whole list.</p>
          ) : (
            <div className="stack" style={{ "--gap": "0px" } as React.CSSProperties}>
              {list.map((s) => (
                <SongRow key={s.id} song={s} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
