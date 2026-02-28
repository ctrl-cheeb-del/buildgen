import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      tailwindcss: path.join(import.meta.dirname, "node_modules/tailwindcss"),
    },
  },
};

export default nextConfig;
