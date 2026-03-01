import type { NextConfig } from "next";

const normalizeUrl = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value.trim().replace(/\/$/, "");
};

const proxyTarget =
  normalizeUrl(process.env.NEXT_PUBLIC_API_PROXY) ??
  normalizeUrl(process.env.API_PROXY_TARGET) ??
  normalizeUrl(process.env.API_INTERNAL_URL) ??
  normalizeUrl(process.env.NEXT_PUBLIC_API_URL) ??
  normalizeUrl(process.env.NODE_ENV === "production" ? null : "http://localhost:4000");

const allowedDevOrigins =
  (process.env.NEXT_ALLOWED_DEV_ORIGINS ??
    process.env.NEXT_PUBLIC_ALLOWED_DEV_ORIGINS ??
    "")
    .split(",")
    .map(normalizeUrl)
    .filter((value): value is string => Boolean(value));

if (allowedDevOrigins.length === 0) {
  allowedDevOrigins.push(
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.0.2.251:3000",
  );
}

const nextConfig: NextConfig = {
  // Silence dev warning when accessing via 127.0.0.1 behind a proxy.
  allowedDevOrigins,
  async rewrites() {
    const rewrites = [];

    if (proxyTarget) {
      rewrites.push({
        source: "/api/v1/:path*",
        destination: `${proxyTarget}/api/v1/:path*`,
      });
    }

    return rewrites;
  },
};

export default nextConfig;
