import "./globals.css";

import type { Metadata } from "next";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Pythia — Markets that reason",
  description: "AI-resolved prediction markets on X Layer with auditable on-chain reasoning trails."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
