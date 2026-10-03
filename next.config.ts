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
      // 대표 확정 10/3 12:32 「OS UI에 다 옮겨놔. 이전 home이나 이런 UI 싫어」 = OS 바깥 공개 화면은 OS 안 대응 화면으로 영구 이동(308).
      // 페이지 파일은 지우지 않았다. 되돌리려면 이 줄만 지우면 된다(단 308 은 브라우저가 기억하니 되돌릴 땐 307 로 한 번 덮는다). 표 = docs/ui/os이식_지도_1003.md
      { source: '/', destination: '/os/make', permanent: true },
      { source: '/home', destination: '/os/make', permanent: true },
      { source: '/landing', destination: '/os/make', permanent: true },
      { source: '/mentors', destination: '/os/market', permanent: true },
      { source: '/mentors/:mentorId', destination: '/os/market/:mentorId', permanent: true },
      { source: '/coach/:mentorId', destination: '/os/market/:mentorId', permanent: true },
      { source: '/chat/:mentorId', destination: '/os/chat/:mentorId', permanent: true },
      { source: '/chats', destination: '/os', permanent: true },
      // 가격 화면은 하나만: /os/charge (대표 지시 0929 00:52). 주소 뒤 값은 그대로 따라간다
      { source: '/pricing', destination: '/os/charge', permanent: true },
      // 클로버 판매는 10/2 종료 → 요금제로
      { source: '/store', destination: '/os/charge', permanent: true },
      { source: '/discover', destination: '/os/market', permanent: true },
      { source: '/discover/:path*', destination: '/os/market', permanent: true },
      // 옛 AI 만들기(긴 글 입력 화면) → OS 주소 넣기. ?advanced=1 이면 옛 화면(고급 편집) 그대로
      { source: '/creator/create', missing: [{ type: 'query', key: 'advanced' }], destination: '/os/make', permanent: false },
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
