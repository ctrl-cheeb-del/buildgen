import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
