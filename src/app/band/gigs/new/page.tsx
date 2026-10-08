import type { Metadata } from "next";
import { requireBand } from "@/lib/band";
import { GigForm } from "../GigForm";

export const metadata: Metadata = { title: "New gig" };

export default async function NewGigPage() {
  await requireBand();
  return (
    <main className="page-narrow stack" style={{ "--gap": "24px" } as React.CSSProperties}>
      <h1>New gig</h1>
      <GigForm />
    </main>
  );
}
