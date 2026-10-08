"use client";

import { useEffect, useRef } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

type Watch = { table: string; filter: string };

/**
 * Calls `reload` whenever a watched row changes, plus a slow poll as a safety net for flaky
 * venue Wi-Fi. Realtime is only a signal: the reload fetches the full current state, so a
 * missed or out-of-order event can never leave the screen wrong for long.
 */
export function useRealtimeRefresh(channel: string, watches: Watch[], reload: () => void, pollMs = 15000) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  const key = JSON.stringify(watches);

  useEffect(() => {
    const supabase = getBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current(), 250);
    };
    let ch = supabase.channel(channel);
    for (const w of JSON.parse(key) as Watch[]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: w.table, filter: w.filter }, schedule);
    }
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") schedule();
    });
    const poll = setInterval(() => reloadRef.current(), pollMs);
    const onVisible = () => document.visibilityState === "visible" && reloadRef.current();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [channel, key, pollMs]);
}
