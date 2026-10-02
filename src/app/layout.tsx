import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import { Suspense } from 'react'
import PostHogTracker from '@/components/PostHogTracker'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import dynamic from 'next/dynamic'
const CloverHunt = dynamic(() => import('@/components/CloverHunt'), { loading: () => null })
import BottomTabs from '@/components/BottomTabs'
import VisitTracker from '@/components/VisitTracker'
import RegisterSW from '@/components/pwa/RegisterSW'
import './globals.css'
import { PLANS } from '@/domains/os/plan'

const SITE_URL = 'https://www.curi-ai.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '큐리AI | 인생 후반전 에이전트 OS',
    template: '%s | 큐리AI',
  },
  description:
    '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/apple-touch-icon-180.png?v=4',
  },
  // 아이폰 「홈 화면에 추가」 = 주소창 없이 앱처럼 열리고, 상태바가 화면 위에 겹친다(검정 바탕이라 자연스럽다)
  appleWebApp: {
    capable: true,
    title: '큐리AI',
    statusBarStyle: 'black-translucent',
  },
  alternates: {
    canonical: SITE_URL,
    // ⚠️ languages(hreflang)를 여기 두면 자식 화면 전부가 상속해
    //    「/pricing 의 영어판은 /en」처럼 사실이 아닌 선언을 하게 된다.
    //    그래서 짝을 이루는 두 화면(/login·/en)에만 각자 적는다.
  },
  openGraph: {
    title: '인생 후반전 에이전트 OS, 큐리AI',
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다.',
    type: 'website',
    url: SITE_URL,
    siteName: '큐리AI',
    locale: 'ko_KR',
    images: [
      {
        url: '/og/curi-os.png',
        width: 1200,
        height: 630,
        alt: '큐리AI | 인생 후반전 에이전트 OS',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: '인생 후반전 에이전트 OS, 큐리AI',
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다.',
    images: ['/og/curi-os.png'],
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
/**
 * AI 검색·구글이 읽는 구조화 데이터 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
 *
 * 전에는 「AI 구독 서비스」 한 줄뿐이라 로봇이 우리가 무엇을 해주는 곳인지 알 수 없었다.
 * AI 로봇은 화면을 그리지 않는다. 여기 적힌 글이 사실상 우리 소개서다.
 * (0910 전수점검 = 큐리어스 본체는 4,617쪽 중 54%가 로봇에게 빈 종이였다)
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: '큐리AI',
      inLanguage: 'ko-KR',
      description: '인생 후반전 에이전트 OS. 이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다.',
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: '큐리AI',
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      parentOrganization: { '@type': 'Organization', name: '미션드리븐', url: 'https://curious-500.com' },
    },
    {
      '@type': 'SoftwareApplication',
      name: '큐리AI',
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'ko-KR',
      description:
        '인생 후반전 에이전트 OS. 이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다.',
      featureList: [
        '내 봇 팀으로 일 나눠 맡기기',
        '내 자료로 답하고 초안 만들기',
        '봇 마켓에서 팀원 찾기',
      ],
      // 판매는 월 요금제뿐이다 (클로버 판매 끝 1002). 값은 요금제 표에서 그대로 읽는다
      offers: PLANS.map(p => ({
        '@type': 'Offer',
        name: p.name,
        price: String(p.price),
        priceCurrency: 'KRW',
        description: p.price === 0 ? '무료로 시작' : `월 ${p.price.toLocaleString('ko-KR')}원 정기결제`,
      })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: '사진 몇 장이 필요한가요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '한 장이면 됩니다. 얼굴이 잘 보이는 밝은 사진 한 장만 올리면 옷과 배경을 바꿔 드립니다.',
          },
        },
        {
          '@type': 'Question',
          name: '실물과 다르게 나오지 않나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '얼굴과 나이를 그대로 둡니다. 모공과 잔주름을 지우지 않아서 사진관에서 찍은 것처럼 나옵니다. 원하면 5살이나 10살 젊게 손볼 수도 있습니다.',
          },
        },
        {
          '@type': 'Question',
          name: '값은 얼마인가요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: `무료로 시작할 수 있습니다. 더 넉넉하게 쓰려면 ${PLANS.filter(p => p.price > 0).map(p => `${p.name} 월 ${p.price.toLocaleString('ko-KR')}원`).join(', ')} 정기결제를 고르면 됩니다.`,
          },
        },
        {
          '@type': 'Question',
          name: '오래된 사진도 살릴 수 있나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '됩니다. 빛바래거나 긁힌 옛날 사진, 초점이 안 맞는 사진, 어두운 사진을 고칠 수 있습니다. 옷차림과 배경은 그 시절 그대로 둡니다.',
          },
        },
        {
          '@type': 'Question',
          name: '회원가입을 해야 쓸 수 있나요?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: '가입 없이도 둘러볼 수 있습니다. 봇과 대화하고 내 봇 팀을 꾸리려면 카카오나 구글로 가입하면 됩니다.',
          },
        },
      ],
    },
  ],
}

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID
const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 글꼴 = 프리텐다드. 비글루가 쓰는 그 글꼴이다(대표 확인 0915).
            한글 자간이 고르고 굵기가 9단계라 중장년용으로 크게 키워도 뭉개지지 않는다.
            구글 폰트(Noto Sans KR)는 굵게 했을 때 획이 붙어 보였다. */}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="preload"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          @font-face {
            font-family: 'Pretendard Variable';
            font-display: optional;
          }
        ` }} />
        {/* 광고 스크립트(구글 애드센스)는 뺐다. 대표 결정 0928: 광고 없음 (N2, D8) */}

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
        <Suspense fallback={null}>
          <PostHogTracker />
        </Suspense>
        {/* 어디서 들어왔는지 한 줄 남긴다 — 대표 지시 2026-09-17 */}
        <Suspense fallback={null}>
          <VisitTracker />
        </Suspense>
        <Analytics />
        <SpeedInsights sampleRate={0.3} />
        {children}
        <CloverHunt />
        <BottomTabs />
        {/* 서비스 워커 등록(배포에서만). 옛 인라인 스크립트를 컴포넌트 한 줄로 바꿨다 */}
        <RegisterSW />
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
        {/* 카카오 JS SDK — script onload로 초기화 보장 */}
        <Script
          id="kakao-sdk-loader"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var s = document.createElement('script');
                s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
                s.integrity = 'sha384-DKYJZ8NLiK8MN4/C5P2dtSmLQ4KwPaoqAfyA/DfmEc1VDxu4yyC7wy6K1Hs90nka';
                s.crossOrigin = 'anonymous';
                s.onload = function() {
                  if (window.Kakao && !window.Kakao.isInitialized()) {
                    window.Kakao.init('27c5c27a03c6f936db39d20090643b3c');
                    console.log('[Kakao] SDK initialized:', window.Kakao.isInitialized());
                  }
                };
                document.head.appendChild(s);
              })();
            `,
          }}
        />
      </body>
    </html>
  )
}
