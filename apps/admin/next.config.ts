import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  serverExternalPackages: ["@food/config"],
  experimental: { cpus: 2 },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default config;
