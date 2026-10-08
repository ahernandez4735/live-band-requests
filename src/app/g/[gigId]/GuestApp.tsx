"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { en as t } from "@/lib/i18n/guest";
import { normalize } from "@/lib/text";
import type { Band } from "@/lib/types";
import type { GuestQueue, GuestQueueItem } from "@/lib/guest-data";
import { BandProfile } from "./BandProfile";

type SongLite = { id: string; title: string; artist: string; tags: string[] };
type Choice = { songId?: string; title: string; artist: string };
type Now = { id: string; title: string; artist: string; lyrics: string | null; shoutouts: { name: string; text: string }[] } | null;
type Tab = "songs" | "queue" | "lyrics" | "band";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;
const NAME_KEY = "lbr_name";

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}
function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private browsing: the name just isn't remembered.
  }
}

export function GuestApp(props: {
  gigId: string;
  gigName: string;
  band: Band;
  songs: SongLite[];
  artists: string[];
  initialQueue: GuestQueue;
}) {
  const { gigId, gigName, band, songs, artists } = props;
  const [tab, setTab] = useState<Tab>("songs");
  const [queue, setQueue] = useState<GuestQueue>(props.initialQueue);
  const [ended, setEnded] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/gigs/${gigId}/queue`, { cache: "no-store" });
      if (res.status === 401 || res.status === 404) {
        setEnded(true);
        return;
      }
      if (res.ok) {
        const next = (await res.json()) as GuestQueue;
        setQueue(next);
        if (next.status !== "live") setEnded(true);
      }
    } catch {
      // Offline for a moment; the next realtime event or poll catches up.
    }
  }, [gigId]);

  useRealtimeRefresh(
    `guest-${gigId}`,
    [
      { table: "queue_items", filter: `gig_id=eq.${gigId}` },
      { table: "gigs", filter: `id=eq.${gigId}` },
    ],
    reload,
  );

  function showToast(kind: "ok" | "error", text: string) {
    setToast({ kind, text });
  }

  async function vote(item: GuestQueueItem, dir: 1 | -1) {
    const value = item.myVote === dir ? 0 : dir;
    const apply = (v: number, prevV: number) =>
      setQueue((q) => ({
        ...q,
        items: q.items.map((i) => (i.id === item.id ? { ...i, myVote: v as -1 | 0 | 1, score: i.score - prevV + v } : i)),
      }));
    apply(value, item.myVote);
    setToast(null);
    const res = await fetch(`/api/gigs/${gigId}/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, value }),
    }).catch(() => null);
    if (!res || !res.ok) {
      apply(item.myVote, value);
      const data = res ? await res.json().catch(() => ({})) : {};
      showToast("error", data.error ?? t.offline);
    }
    void reload();
  }

  if (ended) {
    return (
      <main className="page-narrow stack" style={{ ...gap("20px"), paddingTop: 48 }}>
        <h1>{band.name}</h1>
        <p className="notice">{t.ended}</p>
        <BandProfile band={band} />
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", maxWidth: 560, margin: "0 auto" }}>
      <header className="stack" style={{ ...gap("12px"), padding: "18px 16px 14px", borderBottom: "1px solid var(--line)" }}>
        <div className="stack" style={gap("2px")}>
          <p className="eyebrow">
            {gigName} · {t.liveNow}
          </p>
          <h1 style={{ fontSize: 28 }}>{band.name}</h1>
        </div>
        {queue.now ? (
          <button className="btn btn-primary" style={{ justifyContent: "space-between", minHeight: 54, textAlign: "left" }} onClick={() => setTab("lyrics")}>
            <span className="stack" style={gap("0px")}>
              <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.nowPlaying}</span>
              <span style={{ fontSize: 17 }}>{queue.now.title}</span>
            </span>
            <span className="small">{t.singAlong}</span>
          </button>
        ) : null}
      </header>

      <main style={{ flex: 1, padding: "16px 16px 96px" }}>
        {toast ? (
          <p className={toast.kind === "ok" ? "notice" : "error"} role="status" style={{ marginBottom: 14 }}>
            {toast.text}
          </p>
        ) : null}
        {tab === "songs" ? (
          <SongsTab
            band={band}
            songs={songs}
            artists={artists}
            queue={queue}
            gigId={gigId}
            onSent={(msg) => {
              showToast("ok", msg);
              setTab("queue");
              void reload();
            }}
          />
        ) : null}
        {tab === "queue" ? <QueueTab queue={queue} onVote={vote} /> : null}
        {tab === "lyrics" ? <LyricsTab gigId={gigId} nowId={queue.now?.id ?? null} /> : null}
        {tab === "band" ? <BandProfile band={band} /> : null}
      </main>

      <nav
        aria-label="Sections"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          background: "var(--surface)",
          borderTop: "1px solid var(--line)",
          paddingBottom: "env(safe-area-inset-bottom)",
          maxWidth: 560,
          margin: "0 auto",
        }}
      >
        {(["songs", "queue", "lyrics", "band"] as Tab[]).map((id) => (
          <button
            key={id}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => {
              setTab(id);
              setToast(null);
            }}
            style={{
              minHeight: 58,
              border: 0,
              background: "transparent",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              color: tab === id ? "var(--accent)" : "var(--muted)",
              borderTop: `3px solid ${tab === id ? "var(--accent)" : "transparent"}`,
            }}
          >
            {t.tabs[id]}
            {id === "queue" && queue.items.length ? ` (${queue.items.length})` : ""}
          </button>
        ))}
      </nav>
    </div>
  );
}

// --- Songs -----------------------------------------------------------------

function SongsTab({
  band,
  songs,
  artists,
  queue,
  gigId,
  onSent,
}: {
  band: Band;
  songs: SongLite[];
  artists: string[];
  queue: GuestQueue;
  gigId: string;
  onSent: (msg: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [pick, setPick] = useState<Choice | null>(null);
  const [askTitle, setAskTitle] = useState("");
  const [askArtist, setAskArtist] = useState("");

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    songs.forEach((s) => s.tags.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([x]) => x);
  }, [songs]);

  const queuedTitles = useMemo(() => new Set(queue.items.map((i) => normalize(i.title))), [queue.items]);
  const shown = useMemo(() => {
    const q = normalize(search);
    return songs.filter((s) => (!tag || s.tags.includes(tag)) && (!q || normalize(`${s.title} ${s.artist}`).includes(q)));
  }, [songs, search, tag]);

  const policy = band.request_policy;
  const showAsk = policy === "any" || (policy === "listed_artists" && artists.length > 0);

  return (
    <div className="stack" style={gap("14px")}>
      {!queue.requestsOpen ? <p className="notice">{t.requestsClosed}</p> : null}
      <div className="field">
        <label htmlFor="g-search">{t.searchLabel}</label>
        <input id="g-search" type="search" className="input" placeholder={t.searchPlaceholder} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {tags.length > 1 ? (
        <div className="row" style={gap("8px")}>
          <button className="chip" aria-pressed={tag === null} onClick={() => setTag(null)}>
            {t.all}
          </button>
          {tags.map((x) => (
            <button key={x} className="chip" aria-pressed={tag === x} onClick={() => setTag(tag === x ? null : x)}>
              {x}
            </button>
          ))}
        </div>
      ) : null}

      <div>
        {shown.map((s) => (
          <div key={s.id} className="list-row">
            <div className="grow stack" style={gap("2px")}>
              <strong>{s.title}</strong>
              <span className="small muted">
                {s.artist}
                {s.tags.length ? ` · ${s.tags.join(", ")}` : ""}
              </span>
            </div>
            <button
              className="btn btn-outline-accent"
              style={{ minWidth: 96 }}
              disabled={!queue.requestsOpen}
              onClick={() => setPick({ songId: s.id, title: s.title, artist: s.artist })}
            >
              {queuedTitles.has(normalize(s.title)) ? t.addYours : t.request}
            </button>
          </div>
        ))}
        {shown.length === 0 ? <p className="muted" style={{ padding: "14px 0" }}>{t.noMatch}</p> : null}
      </div>

      {policy === "listed" ? <p className="card-tight small muted">{t.listOnly}</p> : null}
      {showAsk && queue.requestsOpen ? (
        <form
          className="card stack"
          style={gap("10px")}
          onSubmit={(e) => {
            e.preventDefault();
            if (!askTitle.trim()) return;
            setPick({ title: askTitle.trim(), artist: askArtist.trim() });
          }}
        >
          <h3>{policy === "any" ? t.askAnything : t.askArtists}</h3>
          <p className="small muted">{policy === "any" ? t.askAnythingHint : t.askArtistsHint}</p>
          {policy === "listed_artists" ? (
            <div className="row" style={gap("6px")} role="radiogroup" aria-label={t.artistName}>
              {artists.map((a) => (
                <button type="button" key={a} role="radio" aria-checked={askArtist === a} className="chip" onClick={() => setAskArtist(a)}>
                  {a}
                </button>
              ))}
            </div>
          ) : (
            <div className="field">
              <label htmlFor="ask-artist">{t.artistName}</label>
              <input id="ask-artist" className="input" value={askArtist} onChange={(e) => setAskArtist(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="ask-title">{t.songName}</label>
            <input id="ask-title" className="input" value={askTitle} onChange={(e) => setAskTitle(e.target.value)} maxLength={200} />
          </div>
          <button className="btn btn-light" disabled={!askTitle.trim() || (policy === "listed_artists" && !askArtist)}>
            {t.ask}
          </button>
        </form>
      ) : null}

      {pick ? (
        <RequestSheet
          gigId={gigId}
          pick={pick}
          shoutoutsEnabled={queue.shoutoutsEnabled}
          onClose={() => setPick(null)}
          onSent={(msg) => {
            setPick(null);
            setAskTitle("");
            setAskArtist("");
            onSent(msg);
          }}
        />
      ) : null}
    </div>
  );
}

function RequestSheet({
  gigId,
  pick,
  shoutoutsEnabled,
  onClose,
  onSent,
}: {
  gigId: string;
  pick: Choice;
  shoutoutsEnabled: boolean;
  onClose: () => void;
  onSent: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [shout, setShout] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = readName();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setName(saved);
    (saved ? document.getElementById("r-shout") : nameRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    saveName(name.trim());
    const res = await fetch(`/api/gigs/${gigId}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        songId: pick.songId,
        title: pick.songId ? undefined : pick.title,
        artist: pick.songId ? undefined : pick.artist,
        name: name.trim(),
        shoutout: shout.trim() || undefined,
      }),
    }).catch(() => null);
    setSending(false);
    if (!res) return setError(t.offline);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Something went wrong.");
    onSent(!pick.songId ? t.sentOffList : shout.trim() ? t.sentShout : t.sent);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(8, 9, 13, 0.72)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 10 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onSubmit={send}
        className="stack"
        style={{ ...gap("14px"), width: "100%", maxWidth: 560, background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: "22px 20px calc(24px + env(safe-area-inset-bottom))" }}
      >
        <div className="stack" style={gap("2px")}>
          <p className="eyebrow">{t.sheetTitle}</p>
          <h2 id="sheet-title">{pick.title}</h2>
          {pick.artist ? <p className="small muted">{pick.artist}</p> : null}
        </div>
        <div className="field">
          <label htmlFor="r-name">{t.yourName}</label>
          <input ref={nameRef} id="r-name" className="input" required maxLength={40} autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {shoutoutsEnabled ? (
          <div className="field">
            <div className="row between">
              <label htmlFor="r-shout">{t.shoutoutLabel}</label>
              <span className="tiny muted">{t.left(80 - shout.length)}</span>
            </div>
            <textarea
              id="r-shout"
              className="textarea"
              style={{ minHeight: 70 }}
              rows={2}
              maxLength={80}
              placeholder={t.shoutoutPlaceholder}
              value={shout}
              onChange={(e) => setShout(e.target.value.slice(0, 80))}
            />
            <p className="hint">{t.shoutoutHint}</p>
          </div>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <button type="button" className="btn btn-big" style={{ flex: 1 }} onClick={onClose}>
            {t.cancel}
          </button>
          <button className="btn btn-primary btn-big" style={{ flex: 2 }} disabled={sending || !name.trim()}>
            {sending ? t.sending : t.send}
          </button>
        </div>
      </form>
    </div>
  );
}

// --- Queue -----------------------------------------------------------------

function QueueTab({ queue, onVote }: { queue: GuestQueue; onVote: (item: GuestQueueItem, dir: 1 | -1) => void }) {
  return (
    <div className="stack" style={gap("12px")}>
      <div className="row between">
        <h2>{t.upNext}</h2>
        <span className="tiny muted">{t.voteHint}</span>
      </div>
      {queue.items.length === 0 ? <p className="muted">{t.emptyQueue}</p> : null}
      {queue.items.map((item, i) => {
        const notes = [
          item.mine ? t.yourRequest : null,
          item.status === "pending_confirm" ? t.waiting : null,
          item.shoutout_count ? t.shoutouts(item.shoutout_count) : null,
        ].filter(Boolean);
        return (
          <div key={item.id} className="card-tight row" style={{ flexWrap: "nowrap" }}>
            <span style={{ width: 22, textAlign: "center", fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--muted)" }}>{i + 1}</span>
            <div className="grow stack" style={gap("2px")}>
              <strong>{item.title}</strong>
              <span className="small muted">{item.artist}</span>
              {notes.length ? <span className="tiny accent-text">{notes.join(" · ")}</span> : null}
            </div>
            <div className="row" style={{ ...gap("6px"), flexWrap: "nowrap" }}>
              <button
                className="btn btn-icon"
                aria-label={`${t.dislike} ${item.title}`}
                aria-pressed={item.myVote === -1}
                style={item.myVote === -1 ? { background: "var(--text)", color: "var(--ground)" } : { background: "var(--raised)" }}
                onClick={() => onVote(item, -1)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <span style={{ minWidth: 24, textAlign: "center", fontWeight: 600 }} aria-label={`${item.score} votes`}>
                {item.score}
              </span>
              <button
                className="btn btn-icon"
                aria-label={`${t.like} ${item.title}`}
                aria-pressed={item.myVote === 1}
                style={item.myVote === 1 ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : { background: "var(--raised)" }}
                onClick={() => onVote(item, 1)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 15l6-6 6 6" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Lyrics ----------------------------------------------------------------

function LyricsTab({ gigId, nowId }: { gigId: string; nowId: string | null }) {
  const [now, setNow] = useState<Now | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gigs/${gigId}/now`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { now: null }))
      .then((d) => !cancelled && setNow(d.now))
      .catch(() => !cancelled && setNow(null));
    return () => {
      cancelled = true;
    };
  }, [gigId, nowId]);

  if (now === undefined) return <p className="muted">…</p>;
  if (!now) return <p className="muted">{t.nothingPlaying}</p>;
  return (
    <div className="stack" style={gap("18px")}>
      <div className="stack" style={gap("2px")}>
        <p className="eyebrow">{t.nowPlaying}</p>
        <h2 style={{ fontSize: 26 }}>{now.title}</h2>
        <p className="muted">{now.artist}</p>
      </div>
      {now.shoutouts.map((s, i) => (
        <p key={i} style={{ padding: 14, borderRadius: 14, border: "1px solid var(--accent)", color: "var(--accent)", fontWeight: 500 }}>
          {s.text} <span className="small">— {s.name}</span>
        </p>
      ))}
      {now.lyrics ? (
        <p style={{ whiteSpace: "pre-line", fontFamily: "var(--display)", fontWeight: 500, fontSize: 24, lineHeight: 1.4 }}>{now.lyrics}</p>
      ) : (
        <p className="muted">{t.lyricsMissing}</p>
      )}
      <p className="tiny muted">{t.lyricsNext}</p>
    </div>
  );
}
