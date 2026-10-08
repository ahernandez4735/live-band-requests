import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestSession } from "@/lib/guest-session";
import type { Band } from "@/lib/types";
import { BandProfile } from "@/app/g/[gigId]/BandProfile";
import { JoinPanel } from "./JoinPanel";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await createAdminClient().from("bands").select("name").eq("slug", slug).maybeSingle();
  return { title: data?.name ?? "Band" };
}

/** Where the band's permanent QR code points. */
export default async function BandPublicPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const db = createAdminClient();
  const { data: band } = await db.from("bands").select("*").eq("slug", slug).maybeSingle<Band>();
  if (!band) notFound();
  const { data: gig } = await db.from("gigs").select("id, name").eq("band_id", band.id).eq("status", "live").maybeSingle();
  if (gig && (await getGuestSession(gig.id))) redirect(`/g/${gig.id}`);

  return (
    <main className="page-narrow stack" style={{ "--gap": "28px", paddingTop: 40 } as React.CSSProperties}>
      <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
        <p className="eyebrow">{gig ? "Playing now" : "Live band"}</p>
        <h1 style={{ fontSize: 40 }}>{band.name}</h1>
        {gig ? <p className="muted">at {gig.name}</p> : null}
      </div>
      {gig ? (
        <JoinPanel slug={band.slug} />
      ) : (
        <p className="card-tight muted">The band isn&apos;t playing a gig right now. When they are, this page lets you request songs.</p>
      )}
      <BandProfile band={band} />
    </main>
  );
}
