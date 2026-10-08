import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sortQueue, type Gig, type QueueItem } from "@/lib/types";

export type GuestQueueItem = Pick<
  QueueItem,
  "id" | "title" | "artist" | "score" | "request_count" | "shoutout_count" | "status" | "pinned" | "off_list" | "created_at"
> & { mine: boolean; myVote: -1 | 0 | 1 };

export type GuestQueue = {
  status: Gig["status"];
  requestsOpen: boolean;
  shoutoutsEnabled: boolean;
  now: { id: string; title: string; artist: string } | null;
  items: GuestQueueItem[];
  myOpenRequests: number;
};

/** Everything the guest's Queue tab shows. No other guests' names leave the server. */
export async function loadGuestQueue(gigId: string, guestId: string): Promise<GuestQueue | null> {
  const db = createAdminClient();
  const { data: gig } = await db
    .from("gigs")
    .select("status, requests_open, shoutouts_enabled, now_playing_item_id")
    .eq("id", gigId)
    .maybeSingle();
  if (!gig) return null;
  const [{ data: items }, { data: votes }, { data: mine }] = await Promise.all([
    db
      .from("queue_items")
      .select("id, title, artist, score, request_count, shoutout_count, status, pinned, off_list, created_at")
      .eq("gig_id", gigId)
      .in("status", ["pending_confirm", "queued", "playing"]),
    db.from("votes").select("queue_item_id, value").eq("gig_id", gigId).eq("guest_id", guestId),
    db.from("requests").select("queue_item_id").eq("gig_id", gigId).eq("guest_id", guestId),
  ]);
  const voteMap = new Map((votes ?? []).map((v) => [v.queue_item_id as string, v.value as -1 | 1]));
  const mineSet = new Set((mine ?? []).map((r) => r.queue_item_id as string));
  const all = (items ?? []) as Omit<GuestQueueItem, "mine" | "myVote">[];
  const playing = all.find((i) => i.status === "playing" && i.id === gig.now_playing_item_id) ?? null;
  const active = sortQueue(all.filter((i) => i.status === "queued" || i.status === "pending_confirm"));
  return {
    status: gig.status,
    requestsOpen: gig.requests_open,
    shoutoutsEnabled: gig.shoutouts_enabled,
    now: playing ? { id: playing.id, title: playing.title, artist: playing.artist } : null,
    items: active.map((i) => ({ ...i, mine: mineSet.has(i.id), myVote: voteMap.get(i.id) ?? 0 })),
    myOpenRequests: active.filter((i) => mineSet.has(i.id)).length,
  };
}
