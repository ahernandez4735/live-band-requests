"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addArtist,
  addSong,
  deleteSong,
  findMissingLyrics,
  importSongs,
  removeArtist,
  retryLyrics,
  setPolicy,
  updateSongTags,
  type FormState,
} from "../actions";
import { POLICY_LABELS, type RequestPolicy, type Song } from "@/lib/types";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <p className="error" role="alert">{state.error}</p>;
  if (state.message) return <p className="notice" role="status">{state.message}</p>;
  return null;
}

export function PolicyPicker({ policy }: { policy: RequestPolicy }) {
  const [pending, start] = useTransition();
  return (
    <section className="card stack" style={gap("10px")}>
      <h3>Guests can request</h3>
      <div className="stack" style={gap("6px")} role="radiogroup" aria-label="Guests can request">
        {(Object.keys(POLICY_LABELS) as RequestPolicy[]).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={policy === p}
            disabled={pending}
            className={policy === p ? "btn btn-light" : "btn"}
            style={{ justifyContent: "flex-start" }}
            onClick={() => start(() => setPolicy(p))}
          >
            {POLICY_LABELS[p].label}
          </button>
        ))}
      </div>
      <p className="small muted">{POLICY_LABELS[policy].help}</p>
    </section>
  );
}

export function ArtistsPanel({ artists, policy }: { artists: { id: string; name: string }[]; policy: RequestPolicy }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addArtist, {});
  const [, start] = useTransition();
  return (
    <section className="card stack" style={gap("10px")}>
      <h3>Artists you cover</h3>
      <p className="small muted">
        For big repertoires: name the artist instead of listing every song.
        {policy !== "listed_artists" ? " Guests only see this list when \"Listed songs and artists\" is on." : ""}
      </p>
      {artists.length > 0 ? (
        <div className="row" style={gap("6px")}>
          {artists.map((a) => (
            <button key={a.id} type="button" className="chip" aria-label={`Remove ${a.name}`} onClick={() => start(() => removeArtist(a.id))}>
              {a.name} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}
      <form action={action} className="row"
        style={{ flexWrap: "nowrap" }}
      >
        <label htmlFor="artist-name" className="sr-only">Artist name</label>
        <input id="artist-name" name="name" className="input" placeholder="Artist name" />
        <button className="btn btn-light" disabled={pending}>Add</button>
      </form>
      <Feedback state={state} />
    </section>
  );
}

export function AddSongForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addSong, {});
  return (
    <section className="card stack" style={gap("10px")}>
      <h3>Add a song</h3>
      <form action={action} className="stack"
        style={gap("10px")}
      >
        <div className="field">
          <label htmlFor="song-title">Title</label>
          <input id="song-title" name="title" className="input" required />
        </div>
        <div className="field">
          <label htmlFor="song-artist">Artist</label>
          <input id="song-artist" name="artist" className="input" />
        </div>
        <div className="field">
          <label htmlFor="song-tags">Tags (optional, comma separated)</label>
          <input id="song-tags" name="tags" className="input" placeholder="Dance, Singalong" />
        </div>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Adding…" : "Add song"}</button>
      </form>
      <Feedback state={state} />
    </section>
  );
}

export function ImportForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(importSongs, {});
  return (
    <section className="card stack" style={gap("10px")}>
      <h3>Paste your list</h3>
      <form action={action} className="stack" style={gap("10px")}>
        <label htmlFor="song-list" className="small muted">
          One song per line, like &quot;September - Earth, Wind &amp; Fire&quot;. Rows copied from a spreadsheet work too.
        </label>
        <textarea id="song-list" name="list" className="textarea" rows={6} placeholder={"September - Earth, Wind & Fire\nDancing Queen - ABBA\nSuavemente - Elvis Crespo"} />
        <button className="btn btn-light" disabled={pending}>{pending ? "Importing…" : "Import songs"}</button>
      </form>
      <Feedback state={state} />
    </section>
  );
}

export function LyricsButton({ remaining }: { remaining: number }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn" disabled={pending} onClick={() => start(async () => void (await findMissingLyrics()))}>
      {pending ? "Looking up lyrics…" : `Find lyrics (${remaining} to check)`}
    </button>
  );
}

export function SongRow({ song }: { song: Song }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState(song.tags.join(", "));
  return (
    <div className="list-row" style={{ opacity: pending ? 0.5 : 1 }}>
      <div className="grow stack" style={gap("2px")}>
        <strong>{song.title}</strong>
        <span className="small muted">
          {song.artist || "Unknown artist"}
          {song.tags.length ? ` · ${song.tags.join(", ")}` : ""}
        </span>
        {editing ? (
          <form
            className="row"
            style={{ flexWrap: "nowrap", marginTop: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                await updateSongTags(song.id, tags);
                setEditing(false);
              });
            }}
          >
            <label htmlFor={`tags-${song.id}`} className="sr-only">Tags for {song.title}</label>
            <input id={`tags-${song.id}`} className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Dance, Slow" />
            <button className="btn btn-light">Save</button>
          </form>
        ) : null}
      </div>
      <span className={`tiny ${song.lyrics_status === "found" ? "muted" : "teal-text"}`} style={{ whiteSpace: "nowrap" }}>
        {song.lyrics_status === "found" ? "Lyrics" : song.lyrics_status === "missing" ? "No lyrics found" : "Not checked"}
      </span>
      {song.lyrics_status === "missing" ? (
        <button className="btn" onClick={() => start(() => retryLyrics(song.id))}>Retry</button>
      ) : null}
      <button className="btn" onClick={() => setEditing((v) => !v)}>Tags</button>
      <button className="btn" aria-label={`Delete ${song.title}`} onClick={() => start(() => deleteSong(song.id))}>
        Delete
      </button>
    </div>
  );
}
