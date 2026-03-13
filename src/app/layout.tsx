import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import Script from 'next/script'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import CloverHunt from '@/components/CloverHunt'
import './globals.css'

const notoSansKr = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: '큐리 AI — 언제든, 나를 아는 멘토에게 물어보세요',
  description:
    'AI 구독 서비스. 콘텐츠 수익화, 브랜딩, 커리어 전환에 대해 24시간 언제든 나만의 AI와 대화하세요.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  openGraph: {
    title: '큐리 AI — 나를 아는 AI',
    description: '콘텐츠 수익화부터 커리어 전환까지, 24시간 AI',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
        {children}
        <CloverHunt />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
        {/* 카카오 JS SDK — afterInteractive + onReady로 확실한 로드 & 초기화 */}
        <Script
          src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js"
          integrity="sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nk"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script
          id="kakao-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              function _initKakao() {
                if (window.Kakao && !window.Kakao.isInitialized()) {
                  window.Kakao.init('27c5c27a03c6f936db39d20090643b3c');
                  console.log('[Kakao] SDK initialized');
                }
              }
              // SDK가 이미 로드되었으면 바로 init, 아니면 2초 후 재시도
              setTimeout(_initKakao, 500);
              setTimeout(_initKakao, 2000);
            `,
          }}
        />
      </body>
    </html>
  )
}
