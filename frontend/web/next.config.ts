import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
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
