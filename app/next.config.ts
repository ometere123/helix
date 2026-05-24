import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack root to this app dir — silences the multi-lockfile warning
  // on Windows when stray package-lock.json files exist in parent dirs.
  turbopack: {
    root: path.resolve(__dirname),
  },

  /**
   * Proxy Circle's Stablecoin Kit API through our server so the browser
   * never makes direct cross-origin requests (which fail because Circle's
   * CORS policy blocks the `x-user-agent` header the App Kit SDK injects).
   *
   * Browser → /api/circle-proxy/... → Next.js server → api.circle.com/...
   */
  async rewrites() {
    return [
      {
        source: "/api/circle-proxy/:path*",
        destination: "https://api.circle.com/:path*",
      },
    ];
  },
};

export default nextConfig;
