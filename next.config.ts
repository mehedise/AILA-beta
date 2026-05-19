import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  serverExternalPackages: ["pdfjs-dist", "sharp", "pdf-to-png-converter"],
};

export default nextConfig;
