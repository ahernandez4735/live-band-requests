"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Formats a timestamp in the viewer's own time zone (the server doesn't know it). */
export function LocalTime({ iso, fallback = "" }: { iso: string | null; fallback?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () =>
      iso
        ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
        : fallback,
    () => fallback,
  );
  return <time dateTime={iso ?? undefined}>{text}</time>;
}
