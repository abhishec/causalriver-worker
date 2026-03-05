import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Inline server-only env vars for Amplify SSR Lambda compatibility
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
    AWS_REGION: process.env.AWS_REGION || "us-east-1",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "abhishek@tookitaki.com",
  },
};

export default nextConfig;
