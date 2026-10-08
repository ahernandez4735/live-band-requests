import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { BandNav } from "./BandNav";

export default async function BandLayout({ children }: LayoutProps<"/band">) {
  const { supabase, user } = await getUser();
  const { data: band } = user
    ? await supabase.from("bands").select("name").eq("owner_id", user.id).maybeSingle()
    : { data: null };
  return (
    <>
      <header className="topbar no-print">
        <Link href="/band" className="brand">
          {band?.name ?? "Your band"}
        </Link>
        {band ? <BandNav /> : <div style={{ flex: 1 }} />}
        <form action={signOut}>
          <button className="btn">Sign out</button>
        </form>
      </header>
      {children}
    </>
  );
}
