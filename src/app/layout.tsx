import type { Metadata, Viewport } from "next";
// Fonts are bundled with the app (no request to Google at build or page load).
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Live Band Requests", template: "%s · Live Band Requests" },
  description: "Song requests, shoutouts and live voting for bands playing private parties.",
};

export const viewport: Viewport = { themeColor: "#14151c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
