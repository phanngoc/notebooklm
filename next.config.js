/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["@langchain/openai", "langchain"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude problematic packages from client bundle
      config.externals = [...(config.externals || []), "hnswlib-node", "faiss-node"]
    }

    // Handle node modules that might cause issues
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    }

    return config
  },
}

module.exports = nextConfig
