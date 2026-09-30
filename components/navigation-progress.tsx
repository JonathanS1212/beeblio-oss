"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin progress bar pinned to the top of the viewport that gives an
 * immediate response cue while an in-app navigation is in flight — e.g. the
 * marketing page's floating Workspace button: in production the destination's
 * RSC fetch takes a moment, and until it commits nothing on screen changes.
 *
 * Navigation start is detected with a capture-phase click listener on
 * same-origin anchors, so every <Link> in the app is covered without wiring
 * each call site. Completion is the router committing a new pathname/search.
 * (This Next version only touches history.pushState at commit time, so the
 * classic "patch pushState" trick would start the bar far too late to be a
 * cue.)
 *
 * The bar waits a beat before appearing so instant, prefetched transitions
 * never flash it, and a safety timeout retires it if no commit follows
 * (e.g. an <a> pointing at a non-route URL).
 */

/** Delay before the bar shows: prefetched navigations commit faster than this. */
const SHOW_DELAY_MS = 120;
/** Backstop for clicks that never produce a route commit. */
const SAFETY_TIMEOUT_MS = 6000;
/** How long the completed bar lingers while it sweeps out and fades. */
const DONE_LINGER_MS = 450;

type Phase = "idle" | "running" | "done";

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}

function NavigationProgressBar() {
  const [phase, setPhase] = useState<Phase>("idle");
  const runningRef = useRef(false);
  const showTimer = useRef<number | undefined>(undefined);
  const retireTimer = useRef<number | undefined>(undefined);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const finish = useCallback(() => {
    window.clearTimeout(showTimer.current);
    if (!runningRef.current) return;
    runningRef.current = false;
    setPhase("done");
    retireTimer.current = window.setTimeout(() => setPhase("idle"), DONE_LINGER_MS);
  }, []);

  // Route committed: retire the bar — or cancel a pending show when the
  // navigation turned out to be instant.
  useEffect(() => {
    finish();
  }, [pathname, searchParams, finish]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const raw = anchor.getAttribute("href");
      if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same-path clicks (hash jumps, redundant links) never commit a route.
      if (url.pathname === location.pathname && url.search === location.search) {
        return;
      }

      window.clearTimeout(showTimer.current);
      showTimer.current = window.setTimeout(() => {
        runningRef.current = true;
        setPhase("running");
        retireTimer.current = window.setTimeout(finish, SAFETY_TIMEOUT_MS);
      }, SHOW_DELAY_MS);
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.clearTimeout(showTimer.current);
      window.clearTimeout(retireTimer.current);
    };
  }, [finish]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-[3px]"
    >
      <div
        className={`h-full origin-left bg-primary nav-progress-${
          phase === "running" ? "run" : "done"
        }`}
      />
    </div>
  );
}
