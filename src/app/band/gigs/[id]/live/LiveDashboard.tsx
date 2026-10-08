"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useRealtimeRefresh } from "@/lib/useRealtimeRefresh";
import { messageFor } from "@/lib/errors";
import { sortQueue, type Gig, type GuestRequest, type QueueItem } from "@/lib/types";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

type State = { gig: Gig | null; items: QueueItem[]; requests: GuestRequest[] };

function names(list: GuestRequest[]): string {
  const n = list.map((r) => r.guest_name);
  if (n.length <= 2) return n.join(" and ");
  return `${n.slice(0, 2).join(", ")} and ${n.length - 2} more`;
}

export function LiveDashboard({ gigId, gigName, joinCode }: { gigId: string; gigName: string; joinCode: string }) {
  const supabase = getBrowserClient();
  const [state, setState] = useState<State>({ gig: null, items: [], requests: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [gig, items, requests] = await Promise.all([
      supabase.from("gigs").select("*").eq("id", gigId).single<Gig>(),
      supabase.from("queue_items").select("*").eq("gig_id", gigId).order("created_at").returns<QueueItem[]>(),
      supabase
        .from("requests")
        .select("id, queue_item_id, guest_name, shoutout, shoutout_status, created_at")
        .eq("gig_id", gigId)
        .order("created_at")
        .returns<GuestRequest[]>(),
    ]);
    if (gig.error || items.error || requests.error) return;
    setState({ gig: gig.data, items: items.data, requests: requests.data });
  }, [supabase, gigId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useRealtimeRefresh(
    `band-${gigId}`,
    [
      { table: "queue_items", filter: `gig_id=eq.${gigId}` },
      { table: "requests", filter: `gig_id=eq.${gigId}` },
      { table: "gigs", filter: `id=eq.${gigId}` },
    ],
    load,
    20000,
  );

  async function run(key: string, fn: () => PromiseLike<{ error: unknown }>) {
    setBusy(key);
    setToast("");
    const { error } = await fn();
    if (error) setToast(messageFor(error));
    await load();
    setBusy(null);
  }

  const byItem = useMemo(() => {
    const map = new Map<string, GuestRequest[]>();
    for (const r of state.requests) map.set(r.queue_item_id, [...(map.get(r.queue_item_id) ?? []), r]);
    return map;
  }, [state.requests]);

  const { gig, items } = state;
  const now = items.find((i) => i.id === gig?.now_playing_item_id && i.status === "playing") ?? null;
  const queue = sortQueue(items.filter((i) => i.status === "queued"));
  const waiting = items.filter((i) => i.status === "pending_confirm");
  const rejected = items.filter((i) => i.status === "rejected");
  const played = items.filter((i) => i.status === "played").length;
  const activeIds = new Set([...queue, ...waiting, ...(now ? [now] : [])].map((i) => i.id));
  const pendingShouts = state.requests.filter((r) => r.shoutout_status === "pending" && activeIds.has(r.queue_item_id));
  const itemTitle = (id: string) => items.find((i) => i.id === id)?.title ?? "";
  const approved = (id: string) => (byItem.get(id) ?? []).filter((r) => r.shoutout_status === "approved");

  if (!gig) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page stack" style={{ ...gap("16px"), maxWidth: 1400 }}>
      <div className="row between">
        <div className="stack" style={gap("2px")}>
          <p className="eyebrow">{gig.status === "live" ? "Live now" : "Not live"}</p>
          <h1 style={{ fontSize: 26 }}>{gigName}</h1>
        </div>
        <div className="row">
          <span className="small muted">
            Join code <strong style={{ color: "var(--text)", letterSpacing: "0.1em" }}>{joinCode}</strong>
          </span>
          <button
            className="btn"
            aria-pressed={gig.requests_open}
            style={gig.requests_open ? { background: "var(--ok-bg)", color: "var(--ok-text)" } : undefined}
            disabled={busy === "open"}
            onClick={() => run("open", () => supabase.from("gigs").update({ requests_open: !gig.requests_open }).eq("id", gigId))}
          >
            {gig.requests_open ? "Requests open" : "Requests closed"}
          </button>
          <Link className="btn" href={`/band/gigs/${gigId}`}>
            Gig settings
          </Link>
        </div>
      </div>

      {gig.status !== "live" ? (
        <p className="error">This gig isn&apos;t live, so guests can&apos;t join. Go live from Gig settings.</p>
      ) : null}
      {toast ? (
        <p className="error" role="alert">
          {toast}
        </p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16, alignItems: "start" }}>
        {/* Now playing */}
        <section className="stack" style={gap("16px")}>
          <div className="card stack" style={gap("14px")}>
            <p className="eyebrow">Now playing</p>
            {now ? (
              <div className="stack" style={gap("4px")}>
                <h2 style={{ fontSize: 34 }}>{now.title}</h2>
                <p className="muted">{now.artist}</p>
              </div>
            ) : (
              <p className="muted">Nothing yet. Tap Next song to start the top request.</p>
            )}
            {now && approved(now.id).length > 0 ? (
              <div className="stack" style={{ ...gap("8px"), background: "var(--accent)", color: "var(--accent-ink)", borderRadius: 14, padding: 14 }}>
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Shoutouts</p>
                {approved(now.id).map((r) => (
                  <p key={r.id} style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 22, lineHeight: 1.2 }}>
                    {r.shoutout} <span style={{ fontWeight: 500, fontSize: 16 }}>— {r.guest_name}</span>
                  </p>
                ))}
              </div>
            ) : null}
            <button
              className="btn btn-light btn-big"
              disabled={busy === "next"}
              onClick={() => run("next", () => supabase.rpc("band_next", { p_gig: gigId }))}
            >
              {queue.length ? `Next song: ${queue[0].title}` : now ? "Finish this song" : "Next song"}
            </button>
          </div>
          <div className="card-tight row between small">
            <span className="muted">Played tonight</span>
            <strong>{played}</strong>
          </div>
          <div className="card-tight row between small">
            <span className="muted">In the queue</span>
            <strong>{queue.length}</strong>
          </div>
        </section>

        {/* Queue */}
        <section className="stack" style={{ ...gap("10px"), gridColumn: "span 1" }} aria-label="Queue">
          {waiting.length > 0 ? (
            <div className="stack" style={gap("8px")}>
              <h2>Waiting for you</h2>
              <p className="small muted">Not on your list. Confirm the ones you can play.</p>
              {waiting.map((item) => (
                <div key={item.id} className="card-tight stack" style={{ ...gap("8px"), border: "1px solid var(--teal)" }}>
                  <div className="row between">
                    <div className="stack grow" style={gap("2px")}>
                      <strong>{item.title}</strong>
                      <span className="small muted">
                        {item.artist || "Artist not given"} · asked by {names(byItem.get(item.id) ?? [])}
                      </span>
                    </div>
                    <span className="small">{item.score} votes</span>
                  </div>
                  <div className="row">
                    <button className="btn btn-primary" disabled={busy === item.id} onClick={() => run(item.id, () => supabase.rpc("band_set_item", { p_item: item.id, p_action: "confirm" }))}>
                      We can play it
                    </button>
                    <button className="btn" disabled={busy === item.id} onClick={() => run(item.id, () => supabase.rpc("band_set_item", { p_item: item.id, p_action: "reject" }))}>
                      Can&apos;t play
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="row between">
            <h2>Queue</h2>
            <span className="small muted">Ranked by guest votes</span>
          </div>
          {queue.length === 0 ? <p className="muted">No requests yet. Point guests to your QR code.</p> : null}
          {queue.map((item, i) => {
            const reqs = byItem.get(item.id) ?? [];
            return (
              <div key={item.id} className="card-tight row" style={{ alignItems: "flex-start", border: item.pinned ? "1px solid var(--accent)" : "1px solid transparent" }}>
                <span style={{ width: 24, fontFamily: "var(--display)", fontWeight: 700, fontSize: 20, color: "var(--muted)", textAlign: "center" }}>{i + 1}</span>
                <div className="stack grow" style={gap("3px")}>
                  <div className="row" style={gap("6px")}>
                    <strong>{item.title}</strong>
                    {item.pinned ? <span className="tag tag-accent">Up next</span> : null}
                    {item.off_list ? <span className="tag tag-teal">Off your list</span> : null}
                  </div>
                  <span className="small muted">
                    {item.artist} · asked by {names(reqs)}
                  </span>
                  {approved(item.id).map((r) => (
                    <span key={r.id} className="small accent-text">
                      {r.shoutout} — {r.guest_name}
                    </span>
                  ))}
                  <div className="row" style={{ ...gap("6px"), marginTop: 6 }}>
                    <button className="btn btn-primary" disabled={busy === item.id} onClick={() => run(item.id, () => supabase.rpc("band_play", { p_item: item.id }))}>
                      Play now
                    </button>
                    <button
                      className="btn"
                      disabled={busy === item.id}
                      onClick={() => run(item.id, () => supabase.rpc("band_set_item", { p_item: item.id, p_action: item.pinned ? "unpin" : "pin" }))}
                    >
                      {item.pinned ? "Unlock" : "Lock as next"}
                    </button>
                    <button className="btn" disabled={busy === item.id} onClick={() => run(item.id, () => supabase.rpc("band_set_item", { p_item: item.id, p_action: "skip" }))}>
                      Skip
                    </button>
                  </div>
                </div>
                <div className="stack" style={{ ...gap("0px"), alignItems: "center", minWidth: 48 }}>
                  <span style={{ fontFamily: "var(--display)", fontWeight: 700, fontSize: 20 }}>{item.score}</span>
                  <span className="tiny muted">votes</span>
                </div>
              </div>
            );
          })}
        </section>

        {/* Shoutouts + couldn't play */}
        <section className="stack" style={gap("16px")}>
          <div className="stack" style={gap("10px")}>
            <h2>Shoutouts to approve</h2>
            {!gig.shoutouts_enabled ? <p className="small muted">Shoutouts are off for this gig.</p> : null}
            {gig.shoutouts_enabled && pendingShouts.length === 0 ? <p className="small muted">Nothing waiting.</p> : null}
            {pendingShouts.map((r) => (
              <div key={r.id} className="card-tight stack" style={gap("8px")}>
                <p>{r.shoutout}</p>
                <p className="small muted">
                  {r.guest_name} · with {itemTitle(r.queue_item_id)}
                </p>
                <div className="row">
                  <button className="btn btn-light grow" disabled={busy === r.id} onClick={() => run(r.id, () => supabase.rpc("band_shoutout", { p_request: r.id, p_approve: true }))}>
                    Approve
                  </button>
                  <button className="btn grow" disabled={busy === r.id} onClick={() => run(r.id, () => supabase.rpc("band_shoutout", { p_request: r.id, p_approve: false }))}>
                    Hide
                  </button>
                </div>
              </div>
            ))}
          </div>
          {rejected.length > 0 ? (
            <div className="stack" style={gap("8px")}>
              <h3>Asked for, couldn&apos;t play</h3>
              {rejected.map((item) => (
                <div key={item.id} className="card-tight row between small">
                  <span>
                    <strong>{item.title}</strong> <span className="muted">{item.artist}</span>
                  </span>
                  <span className="muted">{item.request_count} asked</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
