"use client";

import { useActionState, useState } from "react";
import { saveBand, type FormState } from "./actions";
import { slugify } from "@/lib/text";
import { POLICY_LABELS, type Band, type RequestPolicy } from "@/lib/types";

export function BandForm({ band, origin }: { band: Band | null; origin: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBand, {});
  const [name, setName] = useState(band?.name ?? "");
  const [slug, setSlug] = useState(band?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(band));
  const [policy, setPolicy] = useState<RequestPolicy>(band?.request_policy ?? "listed_artists");
  const shownSlug = slugEdited ? slug : slugify(name);

  return (
    <form action={action} className="stack" style={{ "--gap": "28px" } as React.CSSProperties}>
      <section className="card stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <h2>The basics</h2>
        <div className="field">
          <label htmlFor="name">Band name (required)</label>
          <input id="name" name="name" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="slug">Your link (required)</label>
          <div className="row" style={{ "--gap": "6px", flexWrap: "nowrap" } as React.CSSProperties}>
            <span className="muted small" style={{ whiteSpace: "nowrap" }}>
              {origin.replace(/^https?:\/\//, "")}/b/
            </span>
            <input
              id="slug"
              name="slug"
              className="input"
              required
              value={shownSlug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </div>
          <p className="hint">Your QR code points here, so it stays the same for every gig. Changing it later means reprinting your sign.</p>
        </div>
      </section>

      <section className="card stack" style={{ "--gap": "14px" } as React.CSSProperties}>
        <h2>What guests can request (required)</h2>
        <div className="stack" style={{ "--gap": "8px" } as React.CSSProperties}>
          {(Object.keys(POLICY_LABELS) as RequestPolicy[]).map((p) => (
            <label key={p} className="card-tight row" style={{ cursor: "pointer", border: `1px solid ${policy === p ? "var(--text)" : "transparent"}`, background: "var(--ground)" }}>
              <input type="radio" name="request_policy" value={p} checked={policy === p} onChange={() => setPolicy(p)} />
              <span className="stack grow" style={{ "--gap": "2px" } as React.CSSProperties}>
                <strong>{POLICY_LABELS[p].label}</strong>
                <span className="small muted">{POLICY_LABELS[p].help}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="hint">You can change this any time on the Songs page.</p>
      </section>

      <section className="card stack" style={{ "--gap": "16px" } as React.CSSProperties}>
        <div className="stack" style={{ "--gap": "4px" } as React.CSSProperties}>
          <h2>Get to know the band (optional)</h2>
          <p className="small muted">Guests see this on your page. Anything left blank is hidden. Booking details are how party guests hire you next.</p>
        </div>
        <div className="field">
          <label htmlFor="bio">About the band</label>
          <textarea id="bio" name="bio" className="textarea" maxLength={1000} defaultValue={band?.bio ?? ""} placeholder="Two or three sentences about your sound and the events you play." />
        </div>
        <div className="field">
          <label htmlFor="members">Members</label>
          <input id="members" name="members" className="input" maxLength={300} defaultValue={band?.members ?? ""} placeholder="Ana (vocals), Luis (guitar), …" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="booking_email">Booking email</label>
            <input id="booking_email" name="booking_email" type="email" className="input" defaultValue={band?.booking_email ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="booking_phone">Booking phone</label>
            <input id="booking_phone" name="booking_phone" type="tel" className="input" defaultValue={band?.booking_phone ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="website">Website</label>
            <input id="website" name="website" type="url" className="input" placeholder="https://" defaultValue={band?.website ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="instagram">Instagram handle</label>
            <input id="instagram" name="instagram" className="input" placeholder="@yourband" defaultValue={band?.instagram ?? ""} />
          </div>
        </div>
      </section>

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="notice" role="status">{state.message}</p> : null}
      <button className="btn btn-primary btn-big" disabled={pending}>
        {pending ? "Saving…" : band ? "Save" : "Create band"}
      </button>
    </form>
  );
}
