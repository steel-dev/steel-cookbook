/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["playwright", "playwright-core", "steel-sdk"],
};

export default nextConfig;
