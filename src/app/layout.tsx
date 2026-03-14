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

const SITE_URL = 'https://www.curi-ai.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '큐리 AI — 언제든, 나를 아는 멘토에게 물어보세요',
    template: '%s — 큐리 AI',
  },
  description:
    'AI 구독 서비스. 콘텐츠 수익화, 브랜딩, 커리어 전환에 대해 24시간 언제든 나만의 AI와 대화하세요.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192x192.png',
  },
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: '큐리AI — 나만의 AI를 만들고 수익화해보세요!',
    description: '나만의 AI를 만들고 수익화해보세요! 콘텐츠 수익화, 브랜딩, 커리어 전환까지.',
    type: 'website',
    url: SITE_URL,
    siteName: '큐리 AI',
    locale: 'ko_KR',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: '큐리 AI — 나만의 AI 멘토',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '큐리AI — 나만의 AI를 만들고 수익화해보세요!',
    description: '나만의 AI를 만들고 수익화해보세요! 콘텐츠 수익화, 브랜딩, 커리어 전환까지.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: {
    // 서치콘솔 등록 후 아래 값 추가:
    // google: 'YOUR_GOOGLE_VERIFICATION_CODE',
    other: { 'naver-site-verification': '136635b51e3cb265e16736e70145dcc1f729ec3c' },
  },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

// JSON-LD 구조화 데이터
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '큐리 AI',
  url: SITE_URL,
  description: 'AI 구독 서비스. 콘텐츠 수익화, 브랜딩, 커리어 전환에 대해 24시간 AI 멘토와 대화하세요.',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
    description: '무료 체험 가능',
  },
  creator: {
    '@type': 'Organization',
    name: '큐리 AI',
    url: SITE_URL,
  },
}

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID

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
        {/* JSON-LD 구조화 데이터 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {/* GTM (Google Tag Manager) — noscript fallback */}
        {GTM_ID && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        )}
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
        {/* GTM (Google Tag Manager) — head script */}
        {GTM_ID && (
          <Script
            id="gtm-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${GTM_ID}');
              `,
            }}
          />
        )}
        {/* Microsoft Clarity — 무료 히트맵/세션 리플레이 */}
        {CLARITY_ID && (
          <Script
            id="clarity-script"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window,document,"clarity","script","${CLARITY_ID}");
              `,
            }}
          />
        )}
        {/* 카카오 JS SDK */}
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
              setTimeout(_initKakao, 500);
              setTimeout(_initKakao, 2000);
            `,
          }}
        />
      </body>
    </html>
  )
}
