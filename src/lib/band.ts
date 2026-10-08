import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getUser } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import type { Band } from "@/lib/types";

export async function requireUser() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** The signed-in member's band; sends them to setup if they haven't made one yet. */
export async function requireBand() {
  const { supabase, user } = await requireUser();
  const { data: band } = await supabase.from("bands").select("*").eq("owner_id", user.id).maybeSingle<Band>();
  if (!band) redirect("/band/setup");
  return { supabase, user, band };
}

export async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return siteUrl(host ? `${proto}://${host}` : undefined);
}

export async function bandLink(slug: string): Promise<string> {
  return `${await origin()}/b/${slug}`;
}

export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#14151c", light: "#ffffff" },
  });
}
