import type { NextConfig } from "next";

const tunnelOrigin = process.env.PUBLIC_TUNNEL_ORIGIN;

const nextConfig: NextConfig = {
  // The public tunnel uses a different host for development assets and HMR.
  allowedDevOrigins: tunnelOrigin ? [new URL(tunnelOrigin).hostname] : [],
  async redirects() {
    return [{ source: "/", destination: "/workspace", permanent: false }];
  },
  experimental: {
    // File uploads use the local workspace route.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Document export rasterizes SVGs with sharp outside the bundle.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
