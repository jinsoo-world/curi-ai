'use client'

export const dynamic = 'force-dynamic'

import BotAvatar from '@/components/os/BotAvatar'
import { KakaoMark, GoogleMark } from '@/components/brand/SocialMarks'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { safeNextPath } from '@/lib/safe-next'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState<string | null>(null)
    const [error, setError] = useState('')
    const router = useRouter()
    // 로그인 뒤 돌아갈 주소 (/login?next=/os). 우리 사이트 경로만 받고, 없으면 /mentors
    const [nextPath, setNextPath] = useState<string | null>(null)

    // 이미 약관 동의한 적 있는지 체크 (localStorage)
    const [hasAgreedBefore, setHasAgreedBefore] = useState(false)
    // 최근 사용한 로그인 방식
    const [lastProvider, setLastProvider] = useState<string | null>(null)
    // 카카오톡 인앱 브라우저 감지
    const [isInAppBrowser, setIsInAppBrowser] = useState(false)

    // 약관 동의 state
    const [agreeAll, setAgreeAll] = useState(false)
    const [agreeAge, setAgreeAge] = useState(false)
    const [agreeTerms, setAgreeTerms] = useState(false)
    const [agreePrivacy, setAgreePrivacy] = useState(false)
    // 동의 없이 시작 단추를 누르면 약관 칸으로 스크롤하고 빨간 테두리로 짚어 준다 (대표 승인 0928 사용성 4번. 법적 동의는 그대로 필수)
    const consentRef = useRef<HTMLDivElement>(null)
    const [consentFlash, setConsentFlash] = useState(false)
    // 다른 화면의 「카카오로 시작」「구글로 시작」에서 왔나 (?provider=)
    const [wantProvider, setWantProvider] = useState<'kakao' | 'google' | null>(null)
    const autoStarted = useRef(false)
    const [startNow, setStartNow] = useState<{ provider: 'kakao' | 'google'; next: string | null } | null>(null)

    useEffect(() => {
        // 이미 약관 동의한 적 있으면 약관 UI 숨김
        const agreed = localStorage.getItem('curi_terms_agreed')
        if (agreed === 'true') {
            setHasAgreedBefore(true)
            setAgreeAll(true)
            setAgreeAge(true)
            setAgreeTerms(true)
            setAgreePrivacy(true)
        }

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

        // 이미 로그인 상태면 리다이렉트. 아니고, 예전에 동의했고, 단추를 골라 왔으면 그 로그인을 바로 연다
        const supabase = createClient()
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                router.replace(next ?? '/mentors')
                return
            }
            const inApp = /KAKAOTALK|NAVER|Line|Instagram|FB_IAB|FBAN/i.test(navigator.userAgent || '')
            if (want && agreed === 'true' && !autoStarted.current && !(want === 'google' && inApp)) {
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

    const allChecked = agreeAge && agreeTerms && agreePrivacy

    /** 셋 다 동의되면 빨간 안내를 걷는다 */
    const clearConsentWarn = (all: boolean) => {
        if (all) { setConsentFlash(false); setError('') }
    }

    const handleAgreeAll = () => {
        const next = !agreeAll
        setAgreeAll(next)
        setAgreeAge(next)
        setAgreeTerms(next)
        setAgreePrivacy(next)
        clearConsentWarn(next)
    }

    const handleIndividual = (
        setter: (v: boolean) => void,
        currentAge: boolean,
        currentTerms: boolean,
        currentPrivacy: boolean,
        which: 'age' | 'terms' | 'privacy'
    ) => {
        const newVal = which === 'age' ? !currentAge : currentAge
        const newTerms = which === 'terms' ? !currentTerms : currentTerms
        const newPrivacy = which === 'privacy' ? !currentPrivacy : currentPrivacy
        setter(which === 'age' ? !currentAge : which === 'terms' ? !currentTerms : !currentPrivacy)

        if (newVal && newTerms && newPrivacy) {
            setAgreeAll(true)
        } else {
            setAgreeAll(false)
        }
        clearConsentWarn(newVal && newTerms && newPrivacy)
    }

    const supabase = createClient()

    const handleSocialLogin = async (provider: 'google' | 'kakao', nextOverride?: string | null) => {
        if (!allChecked && !nextOverride) {
            // 회색 죽은 단추 대신: 눌렀을 때 약관 칸으로 데려가 무엇을 하면 되는지 말해 준다
            setError('필수 약관 3개에 동의해 주세요. 「모두 동의」를 누르면 한 번에 돼요.')
            setConsentFlash(true)
            consentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            return
        }
        const goNext = nextOverride ?? nextPath
        // 약관 동의 기록 저장 (다음 로그인 때 건너뛰기)
        localStorage.setItem('curi_terms_agreed', 'true')
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
        void Promise.resolve().then(() => handleSocialLogin(startNow.provider, startNow.next ?? '/mentors'))
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

                {/* 약관 동의 — 처음 동의한 적 없을 때만 표시 */}
                {!hasAgreedBefore && (
                <div ref={consentRef} data-testid="login-consent" data-flash={consentFlash ? '1' : '0'} style={{
                    background: consentFlash ? '#fff7f7' : '#f9fafb',
                    borderRadius: 16,
                    padding: '14px 16px',
                    marginBottom: 20,
                    border: consentFlash ? '2px solid #dc2626' : '1px solid #e5e7eb',
                    transition: 'border-color 200ms, background 200ms',
                    scrollMarginTop: 24,
                }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                        약관 및 개인정보 처리방침
                    </div>

                    {/* 모두 동의 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        minHeight: 52, padding: '6px 0',
                        borderBottom: '1px solid #e5e7eb',
                        cursor: 'pointer', userSelect: 'none',
                        marginBottom: 4,
                    }}>
                        <input
                            type="checkbox"
                            checked={agreeAll}
                            onChange={handleAgreeAll}
                            style={{
                                width: 24, height: 24, borderRadius: 4, flex: '0 0 auto',
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 17, fontWeight: 700, color: '#18181b' }}>
                            모두 동의
                        </span>
                    </label>

                    {/* 만 14세 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        minHeight: 48, padding: '4px 0', cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreeAge}
                            onChange={() => handleIndividual(setAgreeAge, agreeAge, agreeTerms, agreePrivacy, 'age')}
                            style={{
                                width: 24, height: 24, borderRadius: 4, flex: '0 0 auto',
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 16, color: '#374151', lineHeight: 1.45 }}>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>*</span> 만 14세 이상임을 확인합니다.
                        </span>
                    </label>

                    {/* 이용약관 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        minHeight: 48, padding: '4px 0', cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreeTerms}
                            onChange={() => handleIndividual(setAgreeTerms, agreeAge, agreeTerms, agreePrivacy, 'terms')}
                            style={{
                                width: 24, height: 24, borderRadius: 4, flex: '0 0 auto',
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 16, color: '#374151', lineHeight: 1.45 }}>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>*</span>{' '}
                            큐리 AI의{' '}
                            <Link
                                href="/terms"
                                target="_blank"
                                style={{ color: '#16a34a', textDecoration: 'underline', fontWeight: 600 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                서비스 이용약관
                            </Link>
                        </span>
                    </label>

                    {/* 개인정보 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        minHeight: 48, padding: '4px 0', cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreePrivacy}
                            onChange={() => handleIndividual(setAgreePrivacy, agreeAge, agreeTerms, agreePrivacy, 'privacy')}
                            style={{
                                width: 24, height: 24, borderRadius: 4, flex: '0 0 auto',
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 16, color: '#374151', lineHeight: 1.45 }}>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>*</span>{' '}
                            큐리 AI의{' '}
                            <Link
                                href="/privacy"
                                target="_blank"
                                style={{ color: '#16a34a', textDecoration: 'underline', fontWeight: 600 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                개인정보 처리방침
                            </Link>
                        </span>
                    </label>
                </div>
                )}

                {/* Social Login  -  2026-09-19: 카카오 우선 배치 (4060 중년 사용자 주 인증 수단) */}
                {!allChecked && !hasAgreedBefore && !error && (
                    <p style={{ fontSize: 15, color: '#4b5563', textAlign: 'center', margin: '0 0 10px', lineHeight: 1.5 }}>
                        {wantProvider ? `위 약관에 동의한 뒤 ${wantProvider === 'kakao' ? '카카오' : 'Google'} 단추를 눌러 주세요` : '위 약관에 동의한 뒤 눌러 주세요'}
                    </p>
                )}
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
