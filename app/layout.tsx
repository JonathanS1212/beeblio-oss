import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Carlito, EB_Garamond, Geist, IBM_Plex_Mono, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const display = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

// Microsoft document fonts are not installed on many non-Windows devices.
// Carlito is metric-compatible with Calibri; EB Garamond provides a real
// Garamond face everywhere. Aptos uses the already-bundled Geist fallback.
const officeSans = Carlito({
  variable: "--font-office-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const garamond = EB_Garamond({
  variable: "--font-garamond",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Beeblio",
  description: "Research workspace",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html
      className={cn(sans.variable, mono.variable, display.variable, officeSans.variable, garamond.variable)}
      data-scroll-behavior="smooth"
      lang="en"
      suppressHydrationWarning
    >
      <body>
        <Providers>
          <TooltipProvider>
            <NavigationProgress />
            {children}
          </TooltipProvider>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
