"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { darkTheme, lightTheme, RainbowKitProvider, type Theme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { ReactNode, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "@/lib/wagmi";

// Muted amber-gold accent shared with the CSS tokens, so the RainbowKit modal matches the app.
const ACCENT_LIGHT = "#B07D2A";
const ACCENT_DARK = "#E0B252";

function ThemedProviders({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const rkTheme: Theme = useMemo(
    () =>
      isDark
        ? darkTheme({ accentColor: ACCENT_DARK, accentColorForeground: "#141310", borderRadius: "medium" })
        : lightTheme({ accentColor: ACCENT_LIGHT, accentColorForeground: "#FFFFFF", borderRadius: "medium" }),
    [isDark]
  );

  return (
    <RainbowKitProvider theme={rkTheme} initialChain={196}>
      {children}
      <Toaster theme={isDark ? "dark" : "light"} position="top-right" richColors />
    </RainbowKitProvider>
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          <ThemedProviders>{children}</ThemedProviders>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
