"use client";

import { AuthUIProvider } from "@neondatabase/auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { useCallback, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth/client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const navigateAfterAuth = useCallback((href: string) => {
    // Auth changes the session cookie outside the App Router. A document
    // navigation guarantees that the destination's server render and proxy
    // both observe the new cookie. Client navigation can otherwise retain the
    // login tree in production until the user manually reloads the page.
    window.location.assign(href);
  }, []);

  return (
    <div className="neon-auth-ui">
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <AuthUIProvider
          authClient={authClient}
          navigate={navigateAfterAuth}
          replace={router.replace}
          social={{ providers: ["google"] }}
          basePath="/"
          viewPaths={{ SIGN_IN: "login", SIGN_UP: "signup" }}
          redirectTo="/workspace"
          Link={Link}
          magicLink={false}
          multiSession={false}
          apiKey={false}
          passkey={false}
          oneTap={false}
        >
          {children}
          <Toaster />
        </AuthUIProvider>
      </ThemeProvider>
    </div>
  );
}
