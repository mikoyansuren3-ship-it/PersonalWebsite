import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to this project. Next.js otherwise infers it from
    // the nearest lockfile and walks up to ~/package-lock.json, which makes
    // Turbopack watch the entire home directory and exhaust memory on compile.
    root: __dirname,
  },
};

export default nextConfig;
