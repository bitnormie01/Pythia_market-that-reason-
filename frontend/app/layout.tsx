import "./globals.css";

import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import Providers from "./providers";

export const metadata: Metadata = {
  title: "Pythia — Markets that reason",
  description: "AI-resolved prediction markets on X Layer with auditable on-chain reasoning trails.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/pythia-mark.svg"
  }
};

// next-themes applies the theme class to <html> via an inline script before paint.
// Defining the script inline here (rather than relying solely on the provider) guarantees
// no flash of the wrong theme even on the very first paint.
const noFlashScript = `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;if(t==='dark'){c.add('dark')}else{c.remove('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
