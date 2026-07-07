/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set BUILD_STANDALONE=1 (the Dockerfile does) for a self-contained server.js bundle;
  // left off otherwise so plain `npm start` keeps working.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  reactStrictMode: true,
  // These flags harden builds in constrained/sandboxed environments; safe to remove locally.
  experimental: { cpus: 1, workerThreads: false, webpackBuildWorker: false },
};
export default nextConfig;
