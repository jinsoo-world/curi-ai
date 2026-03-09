import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24, // 24시간 캐시
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ueemicebrauwddtzvuyb.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // 빌드 로그 최소화 (배포 속도 향상)
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // 실험적 패키지 최적화 (번들 크기 감소)
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
  // 클라이언트 캐시 헤더
  async headers() {
    return [
      {
        source: '/(terms|privacy)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=604800' },
        ],
      },
      {
        source: '/login',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, s-maxage=86400' },
        ],
      },
    ]
  },
};

export default nextConfig;
