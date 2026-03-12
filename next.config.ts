import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  // Adds the repository name as a prefix to all paths
  // Required for GitHub Pages when hosting on a subpath rather than a custom domain
  basePath: isProd ? '/p-pack-opener-app' : '',
  assetPrefix: isProd ? '/p-pack-opener-app/' : '',
};

export default nextConfig;
