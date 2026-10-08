import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWithinGig } from "@/lib/geo";
import { setGuestCookie } from "@/lib/guest-session";

const body = z.object({
  slug: z.string().max(40),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).max(100000).optional(),
  code: z.string().regex(/^\d{4}$/).optional(),
});

/**
 * A guest joins the band's live gig, either by being near the venue or with the code the band
 * shows on stage. The location is compared here and then discarded; it is never stored.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { slug, lat, lng, accuracy, code } = parsed.data;
  const db = createAdminClient();

  const { data: band } = await db.from("bands").select("id").eq("slug", slug).maybeSingle();
  if (!band) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: gig } = await db.from("gigs").select("id").eq("band_id", band.id).eq("status", "live").maybeSingle();
  if (!gig) return NextResponse.json({ error: "not_live" }, { status: 409 });
  const { data: priv } = await db.from("gig_private").select("lat, lng, radius_m, join_code").eq("gig_id", gig.id).single();
  if (!priv) return NextResponse.json({ error: "not_live" }, { status: 409 });

  let via: "location" | "code" | null = null;
  if (code) {
    if (code !== priv.join_code) {
      // Slow down guessing a little.
      await new Promise((r) => setTimeout(r, 600));
      return NextResponse.json({ error: "bad_code" }, { status: 403 });
    }
    via = "code";
  } else if (lat != null && lng != null) {
    if (priv.lat == null || priv.lng == null) return NextResponse.json({ error: "no_location" }, { status: 409 });
    if (!isWithinGig({ lat: priv.lat, lng: priv.lng, radiusM: priv.radius_m }, { lat, lng, accuracyM: accuracy })) {
      return NextResponse.json({ error: "far" }, { status: 403 });
    }
    via = "location";
  } else {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const { data: session, error } = await db
    .from("guest_sessions")
    .insert({ gig_id: gig.id, joined_via: via })
    .select("id")
    .single();
  if (error || !session) return NextResponse.json({ error: "server" }, { status: 500 });
  await setGuestCookie(session.id);
  return NextResponse.json({ gigId: gig.id });
}
