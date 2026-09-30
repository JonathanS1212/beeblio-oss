import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/workspace", permanent: false }];
  },
  // Rewrites removed. Proxying is now handled by the API route at app/eve/[...path]/route.ts
  experimental: {
    // Keep Server Actions below Vercel's 4.5 MB platform payload ceiling.
    // Workspace files use signed browser-to-GCS uploads instead.
    serverActions: { bodySizeLimit: "4mb" },
  },
  // Document export rasterizes SVGs with sharp outside the bundle.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
