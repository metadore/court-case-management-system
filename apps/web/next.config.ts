import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tpt-court/ui", "@tpt-court/types"],
  turbopack: {
    resolveAlias: {
      "@tpt-court/ui": "../packages/ui/src",
      "@tpt-court/types": "../packages/types/src",
    },
  },
};

export default nextConfig;