import type { Metadata } from "next";
import Link from "next/link";
import { bandLink, qrSvg, requireBand } from "@/lib/band";
import type { Gig } from "@/lib/types";
import { LocalTime } from "./LocalTime";

export const metadata: Metadata = { title: "Gigs" };

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

export default async function BandHome() {
  const { supabase, band } = await requireBand();
  const [{ data: gigs }, { count: songCount }] = await Promise.all([
    supabase.from("gigs").select("*").eq("band_id", band.id).order("created_at", { ascending: false }).returns<Gig[]>(),
    supabase.from("songs").select("id", { count: "exact", head: true }).eq("band_id", band.id),
  ]);
  const link = await bandLink(band.slug);
  const svg = await qrSvg(link);
  const all = gigs ?? [];
  const live = all.find((g) => g.status === "live");
  const upcoming = all.filter((g) => g.status === "draft");
  const past = all.filter((g) => g.status === "ended");

  return (
    <main className="page stack" style={gap("24px")}>
      {(songCount ?? 0) === 0 ? (
        <div className="notice">
          Add your songs before your first gig. <Link href="/band/songs">Go to Songs</Link>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 20, alignItems: "start" }}>
        <div className="stack" style={{ ...gap("20px"), gridColumn: "span 2" }}>
          {live ? (
            <section className="card stack" style={{ ...gap("10px"), border: "1px solid var(--accent)" }}>
              <p className="eyebrow accent-text">Live now</p>
              <h2>{live.name}</h2>
              <div className="row">
                <Link className="btn btn-primary btn-big" href={`/band/gigs/${live.id}/live`}>
                  Open live dashboard
                </Link>
                <Link className="btn" href={`/band/gigs/${live.id}`}>
                  Gig settings
                </Link>
              </div>
            </section>
          ) : null}

          <section className="stack" style={gap("10px")}>
            <div className="row between">
              <h2>Upcoming gigs</h2>
              <Link className="btn btn-primary" href="/band/gigs/new">
                New gig
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="muted">No upcoming gigs. Create one before the party so you can go live with one tap.</p>
            ) : (
              upcoming.map((g) => <GigRow key={g.id} gig={g} />)
            )}
          </section>

          {past.length > 0 ? (
            <section className="stack" style={gap("10px")}>
              <h2>Past gigs</h2>
              {past.map((g) => (
                <GigRow key={g.id} gig={g} />
              ))}
            </section>
          ) : null}
        </div>

        <section className="card stack" style={gap("12px")}>
          <h3>Your band&apos;s QR code</h3>
          <div
            style={{ background: "#fff", borderRadius: 12, padding: 10, maxWidth: 220 }}
            aria-label={`QR code for ${link}`}
            role="img"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
          <p className="small muted">
            The same code at every gig. It opens whichever gig is live, and your profile between gigs.
          </p>
          <p className="small">
            <a href={link}>{link.replace(/^https?:\/\//, "")}</a>
          </p>
          <Link className="btn" href="/band/sign">
            Print a sign
          </Link>
        </section>
      </div>
    </main>
  );
}

function GigRow({ gig }: { gig: Gig }) {
  return (
    <Link href={gig.status === "live" ? `/band/gigs/${gig.id}/live` : `/band/gigs/${gig.id}`} className="card-tight row between" style={{ color: "inherit", textDecoration: "none" }}>
      <span className="stack" style={gap("2px")}>
        <strong>{gig.name}</strong>
        <span className="small muted">
          <LocalTime iso={gig.starts_at} fallback="No date set" />
        </span>
      </span>
      <span className="small muted">{gig.status === "ended" ? "Ended" : "Open"}</span>
    </Link>
  );
}
