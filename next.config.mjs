const backendUrl = (process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
