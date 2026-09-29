/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "pdfkit", "mammoth"]
  }
};

module.exports = nextConfig;
