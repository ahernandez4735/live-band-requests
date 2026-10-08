import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestSession } from "@/lib/guest-session";
import { errorCode, messageFor } from "@/lib/errors";

const body = z
  .object({
    songId: z.uuid().optional(),
    title: z.string().trim().max(200).optional(),
    artist: z.string().trim().max(200).optional(),
    name: z.string().trim().min(1).max(40),
    shoutout: z.string().trim().max(80).optional(),
  })
  .refine((b) => b.songId || b.title, { message: "song required" });

export async function POST(request: Request, { params }: RouteContext<"/api/gigs/[id]/requests">) {
  const { id } = await params;
  const session = await getGuestSession(id);
  if (!session) return NextResponse.json({ error: messageFor("not_joined") }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add your name and pick a song." }, { status: 400 });
  const b = parsed.data;
  const { data, error } = await createAdminClient().rpc("guest_request", {
    p_gig: id,
    p_guest: session.id,
    p_song: b.songId ?? null,
    p_title: b.title ?? null,
    p_artist: b.artist ?? null,
    p_name: b.name,
    p_shoutout: b.shoutout ?? null,
  });
  if (error) {
    return NextResponse.json({ error: messageFor(error), code: errorCode(error) }, { status: errorCode(error) ? 409 : 500 });
  }
  return NextResponse.json({ itemId: data });
}
