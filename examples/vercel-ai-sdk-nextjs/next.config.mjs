/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright needs the Node.js runtime (not Edge) and cannot be bundled.
  serverExternalPackages: ["playwright", "playwright-core", "steel-sdk"],
};

export default nextConfig;
