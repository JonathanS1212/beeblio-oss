import type { Metadata } from "next";
import type { ReactNode } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = { title: "Beeblio", description: "Research workspace" };

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html data-scroll-behavior="smooth" lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <TooltipProvider>
            <NavigationProgress />
            {children}
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
