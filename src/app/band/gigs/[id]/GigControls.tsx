"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { deleteGig, newJoinCode, setGigStatus, setSongOff } from "../../actions";
import { normalize } from "@/lib/text";
import type { GigStatus } from "@/lib/types";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

export function GigStatusControls({ gigId, status }: { gigId: string; status: GigStatus }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const run = (next: GigStatus) =>
    start(async () => {
      setError("");
      try {
        await setGigStatus(gigId, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  return (
    <section className="card stack" style={gap("10px")}>
      <h3>Status</h3>
      {status === "draft" ? (
        <>
          <p className="small muted">When you go live, your QR code opens this gig and guests can start requesting.</p>
          <button className="btn btn-primary btn-big" disabled={pending} onClick={() => run("live")}>
            Go live
          </button>
          <button
            className="btn"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Delete this gig? This can't be undone.")) start(() => deleteGig(gigId));
            }}
          >
            Delete gig
          </button>
        </>
      ) : null}
      {status === "live" ? (
        <>
          <p className="small muted">Guests can join and request. End the gig when you&apos;re done so the code stops working.</p>
          <button className="btn" disabled={pending} onClick={() => run("ended")}>
            End gig
          </button>
        </>
      ) : null}
      {status === "ended" ? (
        <>
          <p className="small muted">This gig is over. Guests can no longer join it.</p>
          <button className="btn" disabled={pending} onClick={() => run("live")}>
            Go live again
          </button>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}

export function JoinCode({ gigId, code }: { gigId: string; code: string }) {
  const [pending, start] = useTransition();
  return (
    <section className="card stack" style={gap("8px")}>
      <h3>Join code</h3>
      <p style={{ fontFamily: "var(--display)", fontSize: 40, fontWeight: 700, letterSpacing: "0.12em" }}>{code}</p>
      <p className="small muted">For guests whose phone won&apos;t share its location. Say it from the stage or put it on the sign.</p>
      <button className="btn" disabled={pending} onClick={() => start(() => newJoinCode(gigId))}>
        New code
      </button>
    </section>
  );
}

export function TonightSongs({
  gigId,
  songs,
  offIds,
}: {
  gigId: string;
  songs: { id: string; title: string; artist: string }[];
  offIds: string[];
}) {
  const [query, setQuery] = useState("");
  const [, start] = useTransition();
  const [optimisticOff, setOptimisticOff] = useOptimistic(
    new Set(offIds),
    (current: Set<string>, change: { id: string; off: boolean }) => {
      const next = new Set(current);
      if (change.off) next.add(change.id);
      else next.delete(change.id);
      return next;
    },
  );
  const shown = useMemo(() => {
    const q = normalize(query);
    return q ? songs.filter((s) => normalize(`${s.title} ${s.artist}`).includes(q)) : songs;
  }, [songs, query]);
  const onCount = songs.length - optimisticOff.size;

  return (
    <section className="card stack" style={gap("10px")}>
      <h3>Songs for this gig</h3>
      <p className="small muted">
        {onCount} of {songs.length} on. Switch off anything you won&apos;t play tonight.
      </p>
      <label htmlFor="tonight-search" className="sr-only">Search songs</label>
      <input id="tonight-search" className="input" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="stack" style={{ ...gap("0px"), maxHeight: 420, overflowY: "auto" }}>
        {shown.map((s) => {
          const off = optimisticOff.has(s.id);
          return (
            <label key={s.id} className="list-row" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!off}
                onChange={() =>
                  start(async () => {
                    setOptimisticOff({ id: s.id, off: !off });
                    await setSongOff(gigId, s.id, !off);
                  })
                }
              />
              <span className="grow">
                {s.title} <span className="small muted">{s.artist}</span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
