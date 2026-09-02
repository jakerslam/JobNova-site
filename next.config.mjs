/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  assetPrefix: isGithubPages ? "/JobNova-site" : undefined,
  basePath: isGithubPages ? "/JobNova-site" : undefined,
  output: "export",
  reactStrictMode: true,
  agentRules: false,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
