"use client";

import { useActionState, useEffect, useState } from "react";
import { createGig, updateGig, type FormState } from "../actions";
import { RADIUS_OPTIONS } from "@/lib/geo";
import type { Gig, GigPrivate } from "@/lib/types";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const toIso = (local: string) => (local ? new Date(local).toISOString() : "");

export function GigForm({ gig, priv }: { gig?: Gig; priv?: GigPrivate }) {
  const boundAction = gig ? updateGig.bind(null, gig.id) : createGig;
  const [state, action, pending] = useActionState<FormState, FormData>(boundAction, {});
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [address, setAddress] = useState(priv?.address ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    priv?.lat != null && priv?.lng != null ? { lat: priv.lat, lng: priv.lng } : null,
  );
  const [coordsFromDevice, setCoordsFromDevice] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState("");
  const [radius, setRadius] = useState(priv?.radius_m ?? 300);
  const [shoutouts, setShoutouts] = useState(gig?.shoutouts_enabled ?? true);

  // Times are shown in the band's own time zone, which only the browser knows.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStart(toLocalInput(gig?.starts_at ?? null));
    setEnd(toLocalInput(gig?.ends_at ?? null));
  }, [gig?.starts_at, gig?.ends_at]);

  function useDeviceLocation() {
    setLocateError("");
    if (!navigator.geolocation) {
      setLocateError("This browser can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setCoordsFromDevice(true);
        setLocating(false);
      },
      () => {
        setLocateError("Couldn't get this device's location. Check that location is allowed for this site.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <form action={action} className="stack" style={gap("20px")}>
      <section className="card stack" style={gap("14px")}>
        <h2>Gig details</h2>
        <div className="field">
          <label htmlFor="gig-name">Event name (required)</label>
          <input id="gig-name" name="name" className="input" required maxLength={120} defaultValue={gig?.name} placeholder="Evelyn's 60th" />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="gig-start">Starts (optional)</label>
            <input id="gig-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="gig-end">Ends (optional)</label>
            <input id="gig-end" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <input type="hidden" name="starts_at" value={toIso(start)} />
        <input type="hidden" name="ends_at" value={toIso(end)} />
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={shoutouts} onChange={(e) => setShoutouts(e.target.checked)} />
          <span>Guests can add a shoutout to their request</span>
        </label>
        <input type="hidden" name="shoutouts_enabled" value={shoutouts ? "on" : "off"} />
      </section>

      <section className="card stack" style={gap("14px")}>
        <div className="stack" style={gap("4px")}>
          <h2>Where guests can join</h2>
          <p className="small muted">
            Guests who scan your code can join when they&apos;re this close to the venue. Anyone else can use the 4-digit code you
            show on stage.
          </p>
        </div>
        <div className="field">
          <label htmlFor="gig-address">Venue address</label>
          <input
            id="gig-address"
            name="address"
            className="input"
            maxLength={300}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              // A new address gets looked up again on save, unless the band is standing at the venue.
              if (!coordsFromDevice) setCoords(null);
            }}
            placeholder="Street, city"
          />
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={useDeviceLocation} disabled={locating}>
            {locating ? "Getting location…" : "Use this device's location"}
          </button>
          {coords ? (
            <a
              className="small"
              href={`https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=17/${coords.lat}/${coords.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Check the pin on a map
            </a>
          ) : (
            <span className="small muted">The address is looked up on a map when you save.</span>
          )}
        </div>
        {locateError ? <p className="error">{locateError}</p> : null}
        <input type="hidden" name="lat" value={coords?.lat ?? ""} />
        <input type="hidden" name="lng" value={coords?.lng ?? ""} />
        <div className="field">
          <span className="label" id="radius-label">Join radius</span>
          <div className="seg" role="radiogroup" aria-labelledby="radius-label" style={{ maxWidth: 420 }}>
            {RADIUS_OPTIONS.map((r) => (
              <button key={r.meters} type="button" role="radio" aria-checked={radius === r.meters} onClick={() => setRadius(r.meters)}>
                {r.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="radius_m" value={radius} />
          <p className="hint">Phone location is less precise indoors, so pick a bigger radius for large venues. Guests&apos; locations are checked once and never stored.</p>
        </div>
      </section>

      {state.error ? <p className="error" role="alert">{state.error}</p> : null}
      {state.message ? <p className="notice" role="status">{state.message}</p> : null}
      <button className="btn btn-primary btn-big" disabled={pending}>
        {pending ? "Saving…" : gig ? "Save gig" : "Create gig"}
      </button>
    </form>
  );
}
