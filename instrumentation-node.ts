/**
 * @google-cloud/storage's HTTP stack (gaxios/teeny-request) uses node-fetch@2,
 * whose Request constructor still calls the legacy url.parse() on every
 * request. Node 24 surfaces this as DEP0169 — once per process, which is why
 * it appears on the first project-page visit (the first GCS call) and never
 * again. The parsed URLs are built by the Google SDKs, not user input, so the
 * warning is noise. A 'warning' listener cannot suppress it (Node still prints
 * through its internal handler), so intercept the emit instead and forward
 * everything else untouched.
 */
const original = process.emitWarning;

process.emitWarning = function (warning: string, ...args: unknown[]) {
  if (
    typeof warning === "string" &&
    warning.includes("url.parse()") &&
    args[0] === "DeprecationWarning" &&
    args[1] === "DEP0169"
  ) {
    return;
  }
  return original.apply(process, [warning, ...args] as Parameters<typeof process.emitWarning>);
};

export {};
