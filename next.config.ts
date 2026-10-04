import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The estimate route reads the pinned config file from disk at runtime.
  outputFileTracingIncludes: {
    "/api/estimate": ["./config/dist/**"],
  },
  // Stop `next dev` from writing an agent-rules block into CLAUDE.md and AGENTS.md
  // (documented in node_modules/next/dist/docs/01-app/02-guides/ai-agents.md). CLAUDE.md is owner-maintained.
  agentRules: false,
};

export default nextConfig;
