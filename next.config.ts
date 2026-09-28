import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // WASM/네이티브 패키지는 Turbopack 번들링 건너뛰기
  serverExternalPackages: ['@ohah/hwpjs', 'pdf-parse', 'xlsx'],
  // 이미지 최적화
  images: {
    formats: ['image/avif', 'image/webp'],
    // 대표 지시 0914 「AI 화질 좀 더 좋게해」 — 기본값 75 는 얼굴 사진에서 눈가가 뭉갠다
    qualities: [75, 90],
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
  // 옛 주소 → 새 주소. /chats(대화 목록)는 내 봇 팀(/os)으로 통일 (대표 지시 0923)
  async redirects() {
    return [
      { source: '/chats', destination: '/os', permanent: false },
      // 첫 주소는 새 첫 화면으로 곧바로 (페이지를 거치면 1초 새로고침 안내가 끼어 느리다). 대표 지시 0928 23:53
      { source: '/', destination: '/home', permanent: false },
      // 가격 화면은 하나만: 원래 가격 화면 /os/charge (대표 지시 0929 00:52). 주소 뒤 값은 그대로 따라간다
      { source: '/pricing', destination: '/os/charge', permanent: false },
    ]
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
