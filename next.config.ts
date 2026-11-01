import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "local",
  },
  // A short link to share in the family group: opens "Join the family".
  async redirects() {
    return [{ source: "/signup", destination: "/login?mode=signup", permanent: false }];
  },
};

export default nextConfig;
