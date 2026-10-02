"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

function MigrateSystemTheme() {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (theme === "system") setTheme("light");
  }, [theme, setTheme]);
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <MigrateSystemTheme />
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
