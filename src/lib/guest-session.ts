import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export const GUEST_COOKIE = "lbr_guest";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The guest's session for this gig, or null if they haven't joined it. */
export async function getGuestSession(gigId: string): Promise<{ id: string } | null> {
  const store = await cookies();
  const id = store.get(GUEST_COOKIE)?.value;
  if (!id || !UUID.test(id) || !UUID.test(gigId)) return null;
  const { data } = await createAdminClient()
    .from("guest_sessions")
    .select("id")
    .eq("id", id)
    .eq("gig_id", gigId)
    .maybeSingle();
  return data ? { id: data.id } : null;
}

export async function setGuestCookie(sessionId: string) {
  const store = await cookies();
  store.set(GUEST_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 14,
  });
}
