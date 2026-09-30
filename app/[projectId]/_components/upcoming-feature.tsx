"use client";

// Temporary rollout scaffolding. Buttons whose real handlers are disabled
// during the gradual release call notifyUpcomingFeature() instead. To retire
// it: restore the real handlers, delete the notifyUpcomingFeature call sites,
// unmount <UpcomingFeatureDialog /> in app/[projectId]/layout.tsx, and delete
// this file.

import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const UPCOMING_FEATURE_EVENT = "beeblio:upcoming-feature";

/** Opens the shared "coming soon" dialog, optionally naming the feature. */
export function notifyUpcomingFeature(feature?: string) {
  window.dispatchEvent(
    new CustomEvent(UPCOMING_FEATURE_EVENT, { detail: feature }),
  );
}

/** Mounted once in the project layout; renders the dialog on demand. */
export function UpcomingFeatureDialog() {
  const [open, setOpen] = useState(false);
  const [feature, setFeature] = useState<string | undefined>(undefined);

  useEffect(() => {
    const onNotify = (event: Event) => {
      setFeature((event as CustomEvent<string | undefined>).detail);
      setOpen(true);
    };
    window.addEventListener(UPCOMING_FEATURE_EVENT, onNotify);
    return () => window.removeEventListener(UPCOMING_FEATURE_EVENT, onNotify);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Coming Soon</DialogTitle>
          <DialogDescription>
            {feature ? `${feature} is in the works` : "This feature is in the works"} and will be available in an upcoming release.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
