import path from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_OUTPUT === "export";
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingRoot: frontendRoot,
  // Keep production builds from invalidating chunks served by a running dev server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Production (Docker) build: a static export served by FastAPI on the same
  // origin, so the session cookie is first-party and no CORS is needed.
  ...(isExport
    ? { output: "export", images: { unoptimized: true } }
    : {
        // Dev / split deployment: proxy /api to the FastAPI backend so the
        // browser only ever talks to one origin.
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
        },
      }),
};

export default nextConfig;
