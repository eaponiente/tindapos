import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Item photos are served straight from Supabase Storage's public CDN URLs
  // via plain <img> tags, so no remotePatterns config is needed here.
  reactStrictMode: true,
};

export default nextConfig;
