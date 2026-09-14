/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_ORIGIN || "http://127.0.0.1:8000";
    return [
      { source: "/media/:path*", destination: `${api}/media/:path*` },
    ];
  },
};

module.exports = nextConfig;
