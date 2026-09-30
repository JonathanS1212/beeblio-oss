"use client";

import { useEffect } from "react";

const FORCE_LIGHT_SCRIPT =
  '(function(){try{var d=document.documentElement;d.classList.remove("dark");d.style.colorScheme="light"}catch(e){}})()';

/**
 * Pins the route to the light theme. On hard loads the inline script below
 * is server-rendered and runs during HTML parsing — before first paint — so
 * a dark system theme never flashes. The effect keeps the light class
 * applied across soft navigation and next-themes re-application (mount
 * effects, system theme changes).
 *
 * The visitor's persisted next-themes preference is left untouched, so
 * routes that follow the chosen theme render correctly after leaving a
 * pinned route.
 */
export function ForceLightTheme() {
  useEffect(() => {
    const root = document.documentElement;
    // Chrome queues a mutation record for a style-attribute write even when
    // the value is unchanged, so an unguarded pin() here re-triggers this
    // observer forever and freezes the page. Only write when a value actually
    // differs; an observer callback must not mutate what it observes.
    const pin = () => {
      if (root.classList.contains("dark")) root.classList.remove("dark");
      if (root.style.colorScheme !== "light") root.style.colorScheme = "light";
    };
    pin();
    const observer = new MutationObserver(pin);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
    return () => {
      observer.disconnect();
      restorePersistedTheme();
    };
  }, []);

  return (
    // Server render emits an executable script (runs during HTML parsing).
    // Browser renders emit text/plain instead: scripts inserted by React on
    // soft navigations never execute, and React skips its dev warning for
    // them. suppressHydrationWarning covers the type flip on hydration.
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: FORCE_LIGHT_SCRIPT }}
    />
  );
}

function restorePersistedTheme() {
  const root = document.documentElement;
  let theme: string | null = null;
  try {
    theme = localStorage.getItem("theme");
  } catch {
    theme = null;
  }
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}
