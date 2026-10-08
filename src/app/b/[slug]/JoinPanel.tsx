"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const gap = (g: string) => ({ "--gap": g }) as React.CSSProperties;

type Status = "idle" | "locating" | "far" | "denied" | "no_location" | "bad_code" | "error";

const MESSAGES: Partial<Record<Status, string>> = {
  far: "You don't seem to be at the party. Move closer to the band and try again, or use the code the band shows.",
  denied: "Your phone didn't share its location. Use the 4-digit code the band shows instead.",
  no_location: "This gig uses a code to join. Ask the band for it.",
  bad_code: "That code didn't match. Check it with the band.",
  error: "Something went wrong. Try again.",
};

export function JoinPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  async function join(payload: Record<string, unknown>) {
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.gigId) {
      router.replace(`/g/${data.gigId}`);
      return;
    }
    const err = String(data.error ?? "error");
    if (err === "not_live") {
      router.refresh();
      return;
    }
    setStatus(err in MESSAGES ? (err as Status) : "error");
    if (err === "no_location") setShowCode(true);
  }

  function findParty() {
    if (!navigator.geolocation) {
      setStatus("denied");
      setShowCode(true);
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => join({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => {
        setStatus("denied");
        setShowCode(true);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <section className="stack" style={gap("14px")}>
      <p className="muted" style={{ fontSize: 17 }}>
        Share your location once to join the party and start requesting.
      </p>
      <button className="btn btn-primary btn-big" onClick={findParty} disabled={status === "locating"}>
        {status === "locating" ? "Finding the party…" : status === "far" ? "Try again" : "Find the party"}
      </button>
      <p className="tiny muted">Your location is only used to check you&apos;re at the party. It isn&apos;t saved.</p>
      {MESSAGES[status] ? (
        <p className="error" role="alert">
          {MESSAGES[status]}
        </p>
      ) : null}
      {showCode ? (
        <form
          className="stack card-tight"
          style={gap("10px")}
          onSubmit={(e) => {
            e.preventDefault();
            void join({ code });
          }}
        >
          <label htmlFor="join-code">Join code from the band</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input
              id="join-code"
              className="input"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ fontSize: 22, letterSpacing: "0.2em", maxWidth: 140 }}
            />
            <button className="btn btn-light" disabled={code.length !== 4}>
              Join
            </button>
          </div>
        </form>
      ) : (
        <button className="btn" onClick={() => setShowCode(true)}>
          I have a code
        </button>
      )}
    </section>
  );
}
