import fs from "node:fs";
import path from "node:path";

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
  normalizeUrl(process.env.ARCTO_LOCAL_API_FALLBACK ?? "http://localhost:4000");

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

const autohausBasePath = "/Webseite%20Autohaus%20Herrmann";
const autohausStaticEntry = path.join(
  process.cwd(),
  "public",
  "Webseite Autohaus Herrmann",
  "index.html",
);
const hasAutohausStatic = fs.existsSync(autohausStaticEntry);

const staticPageSlugs = [
  "blog",
  "mitarbeiterzugang",
  "service",
  "kontakt",
  "ueber-uns",
  "nutzfahrzeuge-wartung",
  "wartung-wichtig",
  "wohnmobilcheck",
  "datenschutz",
  "impressum",
] as const;

const staticRewrites = hasAutohausStatic
  ? [
      {
        source: "/",
        destination: `${autohausBasePath}/index.html`,
      },
      {
        source: "/blog/:slug",
        destination: `${autohausBasePath}/pages/blog-post.html`,
      },
      ...staticPageSlugs.map((slug) => ({
        source: `/${slug}`,
        destination: `${autohausBasePath}/pages/${slug}.html`,
      })),
      {
        source: "/assets/:path*",
        destination: `${autohausBasePath}/assets/:path*`,
      },
      {
        source: "/pages/:path*",
        destination: `${autohausBasePath}/pages/:path*`,
      },
      {
        source: "/php/:path*",
        destination: `${autohausBasePath}/php/:path*`,
      },
    ]
  : [];

const alzagBasePath = "/Webseite-AlzagConsultig";
const alzagStaticEntry = path.join(
  process.cwd(),
  "public",
  "Webseite-AlzagConsultig",
  "index.html",
);
const hasAlzagStatic = fs.existsSync(alzagStaticEntry);

const alzagStaticPageSlugs = [
  "ueber-uns",
  "loesungen",
  "digitale-praesenz",
  "corporate-design",
  "social-media",
  "individualentwicklung",
  "unsere-erfolge",
  "fallstudien",
  "jobs-karriere",
  "partner-werden",
  "impressum",
  "datenschutz",
  "login",
  "404",
] as const;

const alzagStaticRewrites = hasAlzagStatic
  ? [
      {
        source: "/",
        destination: `${alzagBasePath}/index.html`,
      },
      {
        source: "/index.html",
        destination: `${alzagBasePath}/index.html`,
      },
      ...alzagStaticPageSlugs.flatMap((slug) => [
        {
          source: `/${slug}`,
          destination: `${alzagBasePath}/${slug}.html`,
        },
        {
          source: `/${slug}.html`,
          destination: `${alzagBasePath}/${slug}.html`,
        },
      ]),
      {
        source: "/assets/:path*",
        destination: `${alzagBasePath}/assets/:path*`,
      },
      {
        source: "/sitemap.xml",
        destination: `${alzagBasePath}/sitemap.xml`,
      },
      {
        source: "/robots.txt",
        destination: `${alzagBasePath}/robots.txt`,
      },
      {
        source: "/favicon.ico",
        destination: `${alzagBasePath}/favicon.ico`,
      },
    ]
  : [];

const nextConfig: NextConfig = {
  // Silence dev warning when accessing via 127.0.0.1 behind a proxy.
  allowedDevOrigins,
  async redirects() {
    if (!hasAlzagStatic) {
      return [];
    }

    return [
      {
        source: `${alzagBasePath}`,
        destination: "/",
        permanent: true,
      },
      {
        source: `${alzagBasePath}/`,
        destination: "/",
        permanent: true,
      },
      {
        source: `${alzagBasePath}/index.html`,
        destination: "/",
        permanent: true,
      },
      {
        source: `${alzagBasePath}/:path*`,
        destination: "/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const beforeFiles = [...alzagStaticRewrites, ...staticRewrites];
    const afterFiles = [];

    if (proxyTarget) {
      afterFiles.push({
        source: "/api/v1/:path*",
        destination: `${proxyTarget}/api/v1/:path*`,
      });
      afterFiles.push({
        source: "/socket.io/:path*",
        destination: `${proxyTarget}/socket.io/:path*`,
      });
    }

    return {
      beforeFiles,
      afterFiles,
      fallback: [],
    };
  },
};

export default nextConfig;
