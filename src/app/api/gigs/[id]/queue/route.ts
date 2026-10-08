import { NextResponse } from "next/server";
import { getGuestSession } from "@/lib/guest-session";
import { loadGuestQueue } from "@/lib/guest-data";

export async function GET(_: Request, { params }: RouteContext<"/api/gigs/[id]/queue">) {
  const { id } = await params;
  const session = await getGuestSession(id);
  if (!session) return NextResponse.json({ error: "not_joined" }, { status: 401 });
  const queue = await loadGuestQueue(id, session.id);
  if (!queue) return NextResponse.json({ error: "gig_not_live" }, { status: 404 });
  return NextResponse.json(queue, { headers: { "Cache-Control": "no-store" } });
}
