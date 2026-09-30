"use client";

/**
 * Full-page respondent view for a shared Beeblio form. The form is served as
 * the raw HTML asset (its runtime derives the share id from this URL and
 * posts submissions to /api/share/<id>/submit). The sandbox intentionally
 * omits allow-same-origin: the form runs in an opaque origin so its scripts
 * can never touch a visitor's Beeblio session, at the cost of a CORS-enabled
 * (urlencoded, preflight-free) submit endpoint.
 */
export function PublicFormView({ assetUrl }: { assetUrl: string }) {
  return (
    <iframe
      title="Survey form"
      src={assetUrl}
      sandbox="allow-scripts allow-forms allow-popups"
      className="h-full w-full border-0"
    />
  );
}
