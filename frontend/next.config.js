/** @type {import('next').NextConfig} */
const django =
  process.env.DJANGO_ORIGIN ||
  process.env.NEXT_PUBLIC_API_ORIGIN ||
  "http://127.0.0.1:8877";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${django}/api/:path*` },
      { source: "/media/:path*", destination: `${django}/media/:path*` },
    ];
  },
};

module.exports = nextConfig;
