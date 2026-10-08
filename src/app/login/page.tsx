import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Band sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { user } = await getUser();
  if (user) redirect("/band");
  const { error } = await searchParams;
  return (
    <main className="page-narrow stack" style={{ "--gap": "24px", paddingTop: 64 } as React.CSSProperties}>
      <div className="stack">
        <p className="eyebrow">Band sign in</p>
        <h1>Sign in with your email</h1>
        <p className="muted">We&apos;ll email you a link. No password needed.</p>
      </div>
      {error ? <p className="error">That sign-in link didn&apos;t work or has expired. Request a new one.</p> : null}
      <LoginForm />
    </main>
  );
}
