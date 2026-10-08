/** Error codes raised by the database functions, in words a guest or band member understands. */
const MESSAGES: Record<string, string> = {
  gig_not_live: "This gig isn't live right now.",
  requests_closed: "The band has closed requests for now.",
  not_joined: "Your session ended. Scan the band's code again to rejoin.",
  too_many_requests: "You have 3 requests waiting already. Wait until one is played.",
  song_not_found: "That song isn't on the band's list.",
  song_off_tonight: "The band isn't playing that one tonight.",
  invalid_song: "Type the song name.",
  listed_only: "Tonight the band is only taking requests from their list.",
  artist_not_covered: "The band only takes off-list requests for the artists shown.",
  invalid_vote: "That vote didn't go through.",
  item_not_votable: "That song has already been played or removed.",
  stale: "Someone already did that. The screen has been updated.",
  not_allowed: "You don't have access to that gig.",
};

export function messageFor(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  for (const code of Object.keys(MESSAGES)) {
    if (raw.includes(code)) return MESSAGES[code];
  }
  return "Something went wrong. Try again.";
}

export function errorCode(error: unknown): string | null {
  const raw = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error);
  return Object.keys(MESSAGES).find((c) => raw.includes(c)) ?? null;
}
