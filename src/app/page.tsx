import Link from "next/link";

export default function Home() {
  return (
    <main className="page-narrow stack" style={{ "--gap": "28px", paddingTop: 64 } as React.CSSProperties}>
      <div className="stack" style={{ "--gap": "14px" } as React.CSSProperties}>
        <p className="eyebrow">For bands that play private parties</p>
        <h1 style={{ fontSize: 44 }}>Let the party pick the next song.</h1>
        <p className="muted" style={{ fontSize: 18 }}>
          Guests scan your code, request from your songs with a shoutout, and vote on what plays next. You see one
          live queue and decide.
        </p>
      </div>
      <div className="row">
        <Link className="btn btn-primary btn-big" href="/band">
          Band sign in
        </Link>
      </div>
      <div className="stack small muted">
        <p>Guests: scan the code at the party. There&apos;s nothing to download.</p>
      </div>
    </main>
  );
}
