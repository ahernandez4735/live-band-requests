import type { Band } from "@/lib/types";
import { en as t } from "@/lib/i18n/guest";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

/** The band's "get to know us" and booking section. Empty fields are left out. */
export function BandProfile({ band }: { band: Band }) {
  const handle = band.instagram?.replace(/^@/, "");
  const hasBooking = band.booking_email || band.booking_phone || band.website || handle;
  if (!band.bio && !band.members && !hasBooking) return null;
  return (
    <section className="stack" style={gap("16px")}>
      {band.bio || band.members ? (
        <div className="stack" style={gap("8px")}>
          <h2>{t.meetBand}</h2>
          {band.bio ? <p style={{ color: "var(--text-soft)", whiteSpace: "pre-line" }}>{band.bio}</p> : null}
          {band.members ? <p className="small muted">{band.members}</p> : null}
        </div>
      ) : null}
      {hasBooking ? (
        <div className="card stack" style={gap("10px")}>
          <h3>{t.getInTouch}</h3>
          <div className="stack" style={gap("6px")}>
            {band.booking_email ? (
              <a href={`mailto:${band.booking_email}?subject=${encodeURIComponent(`Booking ${band.name}`)}`}>{band.booking_email}</a>
            ) : null}
            {band.booking_phone ? <a href={`tel:${band.booking_phone.replace(/[^\d+]/g, "")}`}>{band.booking_phone}</a> : null}
            {band.website ? (
              <a href={band.website} target="_blank" rel="noreferrer">
                {band.website.replace(/^https?:\/\//, "")}
              </a>
            ) : null}
            {handle ? (
              <a href={`https://instagram.com/${encodeURIComponent(handle)}`} target="_blank" rel="noreferrer">
                @{handle} on Instagram
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
