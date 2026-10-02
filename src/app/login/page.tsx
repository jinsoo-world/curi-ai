'use client'

export const dynamic = 'force-dynamic'

import BotAvatar from '@/components/os/BotAvatar'
import { KakaoMark, GoogleMark } from '@/components/brand/SocialMarks'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { safeNextPath } from '@/lib/safe-next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TERMS_COOKIE, TERMS_VERSION } from '@/domains/os/onboarding'

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState<string | null>(null)
    const [error, setError] = useState('')
    const router = useRouter()
    // 로그인 뒤 돌아갈 주소 (/login?next=/os). 우리 사이트 경로만 받고, 없으면 /os
    const [nextPath, setNextPath] = useState<string | null>(null)

    // 최근 사용한 로그인 방식
    const [lastProvider, setLastProvider] = useState<string | null>(null)
    // 카카오톡 인앱 브라우저 감지
    const [isInAppBrowser, setIsInAppBrowser] = useState(false)

    // 다른 화면의 「카카오로 시작」「구글로 시작」에서 왔나 (?provider=)
    const [wantProvider, setWantProvider] = useState<'kakao' | 'google' | null>(null)
    const autoStarted = useRef(false)
    const [startNow, setStartNow] = useState<{ provider: 'kakao' | 'google'; next: string | null } | null>(null)

    useEffect(() => {
        // 최근 사용한 로그인 방식 확인
        const saved = localStorage.getItem('curi_last_provider')
        if (saved) setLastProvider(saved)

        // 돌아갈 주소 읽기 (next 파라미터)
        const params = new URLSearchParams(window.location.search)
        const next = safeNextPath(params.get('next'))
        setNextPath(next)
        const p = params.get('provider')
        const want = p === 'kakao' || p === 'google' ? p : null
        setWantProvider(want)
        if (want) {
            // 새로고침, 뒤로 가기로 다시 자동 시작하지 않게 주소에서 뗀다
            params.delete('provider')
            window.history.replaceState(null, '', window.location.pathname + (params.toString() ? `?${params}` : ''))
        }

        // 이미 로그인 상태면 리다이렉트. 아니고, 단추를 골라 왔으면 그 로그인을 바로 연다
        const supabase = createClient()
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                router.replace(next ?? '/os')
                return
            }
            const inApp = /KAKAOTALK|NAVER|Line|Instagram|FB_IAB|FBAN/i.test(navigator.userAgent || '')
            if (want && !autoStarted.current && !(want === 'google' && inApp)) {
                autoStarted.current = true
                setStartNow({ provider: want, next })
            }
        })

        // 카카오톡/인앱 브라우저 감지
        const ua = navigator.userAgent || ''
        if (/KAKAOTALK|NAVER|Line|Instagram|FB_IAB|FBAN/i.test(ua)) {
            setIsInAppBrowser(true)
        }
    }, [router])

    const supabase = createClient()

    const handleSocialLogin = async (provider: 'google' | 'kakao', nextOverride?: string | null) => {
        const goNext = nextOverride ?? nextPath
        // 체크 칸 대신 단추 아래 안내문으로 동의(고지 동의). 시각은 그대로 콜백까지 들고 간다 → users.terms_agreed_at·온보딩 표에 남는다
        localStorage.setItem('curi_terms_agreed', 'true')
        document.cookie = `${TERMS_COOKIE}=${TERMS_VERSION}:${Date.now()}; path=/; max-age=3600; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`
        localStorage.setItem('curi_last_provider', provider)
        setIsLoading(provider)
        setError('')
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    // next 가 있으면 콜백까지 들고 간다 → 콜백이 로그인 뒤 그 주소로 보낸다
                    redirectTo: `${window.location.origin}/auth/callback${goNext ? `?next=${encodeURIComponent(goNext)}` : ''}`,
                    scopes:
                        provider === 'kakao'
                            ? 'account_email profile_nickname profile_image name gender birthday birthyear phone_number'
                            : undefined,
                    queryParams:
                        provider === 'kakao'
                            ? { prompt: 'login' }
                            : { prompt: 'select_account' },
                },
            })
            if (error) throw error
        } catch (err: any) {
            console.error('Login error:', err)
            setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
            setIsLoading(null)
        }
    }

    // 예전에 동의했고 「카카오로 시작」처럼 단추를 골라 왔으면 한 번 더 누르지 않아도 그 로그인을 연다
    useEffect(() => {
        if (!startNow) return
        void Promise.resolve().then(() => handleSocialLogin(startNow.provider, startNow.next ?? '/os'))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startNow])


    return (
        <main style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: '#fafafa',
            position: 'relative',
        }}>
            {/* Background blobs */}
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                <div style={{
                    position: 'absolute', width: 320, height: 320, top: -120, right: -100,
                    background: 'rgba(187, 247, 208, 0.25)', filter: 'blur(80px)', borderRadius: '50%',
                }} />
                <div style={{
                    position: 'absolute', width: 280, height: 280, bottom: -100, left: -80,
                    background: 'rgba(220, 252, 231, 0.3)', filter: 'blur(80px)', borderRadius: '50%',
                }} />
            </div>

            {/* 🎉 무료체험 배너 */}
            <div style={{
                position: 'relative', zIndex: 10,
                width: '100%', maxWidth: 400,
                background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
                border: '1.5px solid #bbf7d0',
                borderRadius: 16,
                padding: '16px 20px',
                marginBottom: 20,
                textAlign: 'center',
                animation: 'fadeIn 0.5s ease',
            }}>
                <div style={{
                    fontSize: 17, fontWeight: 800, color: '#15803d',
                    letterSpacing: '-0.02em',
                }}>
                    로그인하면 대화 한도 2배로 드려요
                </div>
                <div style={{ fontSize: 15, color: '#4b5563', marginTop: 4 }}>
                    기획, 홍보, 개발, 조사를 맡는 봇 4명이 기다려요
                </div>
            </div>

            {/* Card */}
            <div style={{
                position: 'relative', zIndex: 10,
                width: '100%', maxWidth: 400,
                background: '#fff',
                borderRadius: 24,
                padding: '44px 32px 32px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)',
                animation: 'fadeIn 0.5s ease 0.1s both',
            }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <span style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><BotAvatar shape="clover" color="green" state="talking" size={96} name="큐리AI" /></span>
                    {/* 큐리 글자 = 브랜드 초록(globals.css --연두 #22C55E). 검정 아님 (대표 0928) */}
                    <h1 style={{
                        fontSize: 28, fontWeight: 800, color: 'var(--연두, #22C55E)',
                        letterSpacing: '-0.03em', marginBottom: 6,
                    }}>
                        큐리 AI
                    </h1>
                    <p style={{ fontSize: 16, color: '#4b5563', lineHeight: 1.6 }}>
                        로그인하고 내 봇 만들기를 시작해요
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div role="alert" data-testid="login-error" style={{
                        padding: '12px 16px', marginBottom: 16,
                        background: '#fef2f2', color: '#991b1b',
                        borderRadius: 12, fontSize: 15, lineHeight: 1.5, textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                {/* 약관 체크 칸 없음 (대표 지시 0929 「동의는 받지마」): 단추만 누르면 바로 시작, 아래 한 줄로 안내 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Kakao — 1순위 (인앱 브라우저 제약 없음, 중년 친화) */}
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('kakao')}
                        disabled={isLoading !== null}
                        style={{
                            width: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                            padding: '16px 24px', fontSize: 17, fontWeight: 700,
                            borderRadius: 16,
                            minHeight: 56,
                            background: '#FEE500',
                            color: '#191919',
                            border: wantProvider === 'kakao' ? '2px solid #191919' : 'none',
                            boxShadow: '0 2px 8px rgba(254,229,0,0.25)',
                            cursor: 'pointer',
                            transition: 'all 200ms',
                            opacity: isLoading !== null ? 0.5 : 1,
                        }}
                    >
                        {isLoading === 'kakao' ? (
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%',
                                border: '2px solid #d1d5db', borderTopColor: '#191919',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                        ) : (
                            <KakaoMark />
                        )}
                        카카오로 시작하기
                        {lastProvider === 'kakao' && (
                            <span style={{
                                background: '#1f2937', color: '#fff',
                                fontSize: 11, fontWeight: 700,
                                padding: '4px 10px', borderRadius: 20,
                                marginLeft: 4, whiteSpace: 'nowrap',
                            }}>
                                최근 사용
                            </span>
                        )}
                    </button>

                    {/* Google — 2순위 (인앱 브라우저 제약 있음) */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => {
                                if (isInAppBrowser) {
                                    // 인앱 브라우저에서는 외부 브라우저로 안내
                                    const url = window.location.href
                                    if (confirm('카카오톡 브라우저에서는 Google 로그인이 제한됩니다.\n\n외부 브라우저(Safari/Chrome)에서 여시거나,\n위 카카오 로그인을 이용해주세요!')) {
                                        // 안드로이드: intent로 외부 브라우저 열기
                                        window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`
                                    }
                                    return
                                }
                                handleSocialLogin('google')
                            }}
                            disabled={isLoading !== null}
                            style={{
                                width: '100%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                                padding: '16px 24px', fontSize: 17, fontWeight: 600,
                                borderRadius: 16,
                                minHeight: 56,
                                background: '#fff',
                                color: '#1a1a2e',
                                border: wantProvider === 'google' ? '2px solid #1a1a2e' : '1.5px solid #d1d5db',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                cursor: 'pointer',
                                transition: 'all 200ms',
                                opacity: isLoading !== null || isInAppBrowser ? 0.5 : 1,
                            }}
                        >
                            {isLoading === 'google' ? (
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    border: '2px solid #d1d5db', borderTopColor: '#22c55e',
                                    animation: 'spin 0.8s linear infinite',
                                }} />
                            ) : (
                                <GoogleMark />
                            )}
                            Google로 시작하기
                            {lastProvider === 'google' && (
                                <span style={{
                                    background: '#1f2937', color: '#fff',
                                    fontSize: 11, fontWeight: 700,
                                    padding: '4px 10px', borderRadius: 20,
                                    marginLeft: 4, whiteSpace: 'nowrap',
                                }}>
                                    최근 사용
                                </span>
                            )}
                        </button>
                        {isInAppBrowser && (
                            <div style={{
                                fontSize: 14, color: '#b91c1c', textAlign: 'center',
                                marginTop: 4, fontWeight: 500,
                            }}>
                                ⚠️ 카카오톡에서는 Google 로그인이 제한됩니다
                            </div>
                        )}
                    </div>
                </div>




                <p data-testid="login-notice" style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
                    시작하면 만 14세 이상이며{' '}
                    <Link href="/terms" target="_blank" style={{ color: '#4b5563', textDecoration: 'underline' }}>이용약관</Link>과{' '}
                    <Link href="/privacy" target="_blank" style={{ color: '#4b5563', textDecoration: 'underline' }}>개인정보처리방침</Link>에 동의한 것으로 봐요.
                </p>
                {/* Skip */}
                {/* 먼저 둘러보기 = 카카오, 구글 아래 작은 글자 단추(누르는 칸 44px). 위계는 카카오 = 구글 > 둘러보기 (대표 0928).
                    대화에서 왔으면 봇 둘러보기(/os?demo=1)로 */}
                <Link
                    href={nextPath?.startsWith('/os') ? '/os?demo=1' : '/mentors'}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'fit-content',
                        minHeight: 44, padding: '0 14px', fontSize: 16, fontWeight: 600, margin: '10px auto 0',
                        color: '#4b5563', textAlign: 'center', textDecoration: 'underline', textUnderlineOffset: 4,
                    }}
                >
                    먼저 둘러보기
                </Link>
            </div>

            {/* 사업자 정보 푸터 */}
            <footer style={{
                position: 'relative', zIndex: 10,
                width: '100%', maxWidth: 400,
                marginTop: 32,
                padding: '24px 0 16px',
                borderTop: '1px solid #e5e7eb',
            }}>
                {/* 사업자 정보 */}
                <div style={{
                    fontSize: 12, color: '#9ca3af', lineHeight: 1.9,
                    letterSpacing: '-0.01em',
                }}>
                    <div>미션드리븐 (대표 : 김진수) ㅣ curious@mission-driven.kr</div>
                    <div>사업자등록번호 : 277-88-02697 ㅣ 통신판매번호 : 2023-서울마포-2003</div>
                    <div>전화번호 : 010-9716-6015</div>
                    <div style={{ wordBreak: 'keep-all' }}>
                        사무실 : 서울특별시 마포구 성지길 25-11 3층 비123호
                    </div>
                </div>

                {/* 정책 링크 */}
                <div style={{
                    display: 'flex', gap: 4, marginTop: 14,
                    fontSize: 12, flexWrap: 'wrap',
                }}>
                    <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600 }}>
                        개인정보처리방침
                    </Link>
                    <span style={{ color: '#d1d5db' }}>ㅣ</span>
                    <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>
                        서비스이용약관
                    </Link>
                    <span style={{ color: '#d1d5db' }}>ㅣ</span>
                    <Link href="/refund" style={{ color: '#6b7280', textDecoration: 'none' }}>
                        취소/환불정책
                    </Link>
                    <span style={{ color: '#d1d5db' }}>ㅣ</span>
                    <Link href="/support" style={{ color: '#6b7280', textDecoration: 'none' }}>
                        고객센터
                    </Link>
                    <span aria-hidden="true" style={{ color: '#d1d5db' }}>ㅣ</span>
                    <Link
                        href="/en"
                        lang="en"
                        hrefLang="en"
                        style={{ color: '#6b7280', textDecoration: 'none' }}
                    >
                        English
                    </Link>
                </div>

                {/* 카피라이트 */}
                <div style={{
                    fontSize: 11, color: '#d1d5db', marginTop: 12,
                }}>
                    Copyright © 미션드리븐 All rights reserved.
                </div>
            </footer>

            {/* Animation keyframes */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}
            </style>
        </main>
    )
}
