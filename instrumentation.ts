/**
 * Runs once per Next.js server instance. Node-only setup lives in
 * ./instrumentation-node and is imported conditionally so Turbopack's Edge
 * compilation never sees it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
