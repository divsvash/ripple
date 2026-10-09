/** @type {import('next').NextConfig} */
const isExport = process.env.NEXT_OUTPUT === "export";
const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
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
