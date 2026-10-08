import type { Metadata } from "next";
import { bandLink, qrSvg, requireBand } from "@/lib/band";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Printable sign" };

export default async function SignPage() {
  const { band } = await requireBand();
  const link = await bandLink(band.slug);
  const svg = await qrSvg(link);
  return (
    <main className="page-narrow stack" style={{ "--gap": "20px" } as React.CSSProperties}>
      <div className="row between no-print">
        <h1>Printable sign</h1>
        <PrintButton />
      </div>
      <div
        style={{
          background: "#fff",
          color: "#14151c",
          borderRadius: 20,
          padding: "40px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase" }}>Request a song · Pide una canción</p>
        <h2 style={{ fontSize: 40, color: "#14151c" }}>{band.name}</h2>
        <div style={{ width: 280, maxWidth: "100%" }} role="img" aria-label={`QR code for ${link}`} dangerouslySetInnerHTML={{ __html: svg }} />
        <p style={{ fontSize: 18 }}>Scan with your phone camera. Nothing to download.</p>
        <p style={{ fontSize: 14 }}>{link.replace(/^https?:\/\//, "")}</p>
      </div>
      <p className="small muted no-print">Print this on letter paper or save it as a PDF. Table tents, mic stands and the kick drum all work.</p>
    </main>
  );
}
