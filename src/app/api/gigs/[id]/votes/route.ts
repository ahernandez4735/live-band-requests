import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestSession } from "@/lib/guest-session";
import { errorCode, messageFor } from "@/lib/errors";

const body = z.object({ itemId: z.uuid(), value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) });

/** Sets this guest's vote on a song to like (1), dislike (-1) or none (0). Safe to retry. */
export async function POST(request: Request, { params }: RouteContext<"/api/gigs/[id]/votes">) {
  const { id } = await params;
  const session = await getGuestSession(id);
  if (!session) return NextResponse.json({ error: messageFor("not_joined") }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad vote." }, { status: 400 });
  const { error } = await createAdminClient().rpc("guest_vote", {
    p_gig: id,
    p_guest: session.id,
    p_item: parsed.data.itemId,
    p_value: parsed.data.value,
  });
  if (error) return NextResponse.json({ error: messageFor(error), code: errorCode(error) }, { status: 409 });
  return NextResponse.json({ ok: true });
}
