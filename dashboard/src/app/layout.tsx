import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CraftDeck — Minecraft Server Panel",
  description: "Self-hosted management dashboard for your Minecraft server",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
