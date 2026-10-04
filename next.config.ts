import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The estimate route reads the pinned config file from disk at runtime.
  outputFileTracingIncludes: {
    "/api/estimate": ["./config/dist/**"],
  },
};

export default nextConfig;
