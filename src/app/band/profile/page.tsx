import type { Metadata } from "next";
import { origin, requireBand } from "@/lib/band";
import { BandForm } from "../BandForm";

export const metadata: Metadata = { title: "Band profile" };

export default async function ProfilePage() {
  const { band } = await requireBand();
  return (
    <main className="page-narrow stack" style={{ "--gap": "24px" } as React.CSSProperties}>
      <h1>Band profile</h1>
      <BandForm band={band} origin={await origin()} />
    </main>
  );
}
