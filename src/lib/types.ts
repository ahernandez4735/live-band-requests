export type RequestPolicy = "listed" | "listed_artists" | "any";
export type GigStatus = "draft" | "live" | "ended";
export type ItemStatus = "pending_confirm" | "queued" | "playing" | "played" | "skipped" | "rejected";
export type ShoutoutStatus = "none" | "pending" | "approved" | "hidden";

export type Band = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  bio: string | null;
  members: string | null;
  booking_email: string | null;
  booking_phone: string | null;
  website: string | null;
  instagram: string | null;
  request_policy: RequestPolicy;
};

export type Song = {
  id: string;
  band_id: string;
  title: string;
  artist: string;
  tags: string[];
  lyrics: string | null;
  lyrics_status: "unchecked" | "found" | "missing";
};

export type Gig = {
  id: string;
  band_id: string;
  name: string;
  starts_at: string | null;
  ends_at: string | null;
  status: GigStatus;
  requests_open: boolean;
  shoutouts_enabled: boolean;
  now_playing_item_id: string | null;
  created_at: string;
};

export type GigPrivate = {
  gig_id: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  join_code: string;
};

export type QueueItem = {
  id: string;
  gig_id: string;
  song_id: string | null;
  title: string;
  artist: string;
  off_list: boolean;
  status: ItemStatus;
  pinned: boolean;
  score: number;
  request_count: number;
  shoutout_count: number;
  created_at: string;
  started_at: string | null;
};

export type GuestRequest = {
  id: string;
  queue_item_id: string;
  guest_name: string;
  shoutout: string | null;
  shoutout_status: ShoutoutStatus;
  created_at: string;
};

export const POLICY_LABELS: Record<RequestPolicy, { label: string; help: string }> = {
  listed: {
    label: "Listed songs only",
    help: "Guests pick from the songs you have on for the gig. Nothing else can be requested.",
  },
  listed_artists: {
    label: "Listed songs and artists",
    help: "Guests pick from your songs, or ask for any song by the artists you list. Those requests wait until you confirm you can play them.",
  },
  any: {
    label: "Any song",
    help: "Guests can ask for anything. Songs not on your list wait until you confirm you can play them.",
  },
};

/** Queue order everywhere: band's pinned pick first, then votes, then who asked first. */
export function sortQueue<T extends Pick<QueueItem, "pinned" | "score" | "created_at">>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.score - a.score || a.created_at.localeCompare(b.created_at),
  );
}
