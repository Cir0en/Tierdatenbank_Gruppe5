import type { NextConfig } from "next";

// Ziel für /api/* und /uploads/* Requests: das ASP.NET-Core-Backend. Lokal
// (ohne Docker) läuft es auf localhost:5099; im docker-compose-Setup läuft es
// unter dem Service-Namen "backend" im internen Docker-Netzwerk.
const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:5099";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backendUrl}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
