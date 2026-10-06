import type { NextConfig } from "next";
const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  agentRules: false,
  outputFileTracingExcludes: {
    "/*": ["./.data/**/*", "./.env*", "./test-results/**/*"],
  },
  outputFileTracingIncludes: { "/*": ["./database/local.sql"] },
};
export default config;
