"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/band", label: "Gigs" },
  { href: "/band/songs", label: "Songs" },
  { href: "/band/profile", label: "Profile" },
];

export function BandNav() {
  const path = usePathname();
  return (
    <nav aria-label="Band">
      {LINKS.map((l) => {
        const current = l.href === "/band" ? path === "/band" || path.startsWith("/band/gigs") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={current ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
