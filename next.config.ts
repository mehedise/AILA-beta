import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: [
    "pdfjs-dist",
    "sharp",
    "pdf-to-png-converter",
    "@napi-rs/canvas",
  ],
  // Next 16 clones the request body when a proxy/middleware is present and
  // silently truncates anything past `proxyClientMaxBodySize` (default 10mb),
  // which breaks `req.formData()` for larger PDF uploads. Raise it above the
  // 50mb hard cap enforced in `app/api/upload/route.ts`.
  experimental: {
    proxyClientMaxBodySize: "60mb",
  },
  outputFileTracingIncludes: {
    "/api/inngest": ["./lib/pdf/vendor/pdf.worker.mjs"],
    "/*": ["./lib/pdf/vendor/pdf.worker.mjs"],
  },
};

export default nextConfig;
