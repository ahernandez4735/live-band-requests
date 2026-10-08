import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireBand } from "@/lib/band";
import { LiveDashboard } from "./LiveDashboard";

export const metadata: Metadata = { title: "Live" };

export default async function LivePage({ params }: PageProps<"/band/gigs/[id]/live">) {
  const { id } = await params;
  const { supabase, band } = await requireBand();
  const [{ data: gig }, { data: priv }] = await Promise.all([
    supabase.from("gigs").select("id, name, status").eq("id", id).eq("band_id", band.id).maybeSingle(),
    supabase.from("gig_private").select("join_code").eq("gig_id", id).maybeSingle(),
  ]);
  if (!gig) notFound();
  return <LiveDashboard gigId={gig.id} gigName={gig.name} joinCode={priv?.join_code ?? ""} />;
}
