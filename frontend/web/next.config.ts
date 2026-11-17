import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Proxy API requests to the backend so the browser never sees the raw
  // backend URL. In production set BACKEND_URL to your internal service address.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://127.0.0.1:5001"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
