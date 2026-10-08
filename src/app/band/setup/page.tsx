import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { origin, requireUser } from "@/lib/band";
import { BandForm } from "../BandForm";

export const metadata: Metadata = { title: "Set up your band" };

export default async function SetupPage() {
  const { supabase, user } = await requireUser();
  const { data: band } = await supabase.from("bands").select("id").eq("owner_id", user.id).maybeSingle();
  if (band) redirect("/band");
  return (
    <main className="page-narrow stack" style={{ "--gap": "24px" } as React.CSSProperties}>
      <div className="stack">
        <p className="eyebrow">Step 1 of 3</p>
        <h1>Set up your band</h1>
        <p className="muted">Next you&apos;ll add your songs, then your first gig.</p>
      </div>
      <BandForm band={null} origin={await origin()} />
    </main>
  );
}
