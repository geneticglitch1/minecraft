import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The panel is self-hosted on a LAN; no image CDN available.
  images: { unoptimized: true },
};

export default nextConfig;
