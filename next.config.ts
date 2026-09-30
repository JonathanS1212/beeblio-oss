import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
