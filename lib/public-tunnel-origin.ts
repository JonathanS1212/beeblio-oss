/** Public HTTPS origin used for links that must be reachable from outside this computer. */
export function publicTunnelOrigin(): string | null {
  const configured = process.env.PUBLIC_TUNNEL_ORIGIN?.trim();
  return configured ? new URL(configured).origin : null;
}
