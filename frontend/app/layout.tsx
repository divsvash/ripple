import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ripple: cross-domain discovery",
  description: "Enter any event and discover surprising, source-backed connections to seemingly unrelated things.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
