'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState<string | null>(null)
    const [error, setError] = useState('')
    const router = useRouter()

    // 이미 약관 동의한 적 있는지 체크 (localStorage)
    const [hasAgreedBefore, setHasAgreedBefore] = useState(false)
    // 최근 사용한 로그인 방식
    const [lastProvider, setLastProvider] = useState<string | null>(null)

    // 약관 동의 state
    const [agreeAll, setAgreeAll] = useState(false)
    const [agreeAge, setAgreeAge] = useState(false)
    const [agreeTerms, setAgreeTerms] = useState(false)
    const [agreePrivacy, setAgreePrivacy] = useState(false)



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

        // 이미 로그인 상태면 리다이렉트
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                router.replace('/mentors')
            }
        })
    }, [router])

    const allChecked = agreeAge && agreeTerms && agreePrivacy

    const handleAgreeAll = () => {
        const next = !agreeAll
        setAgreeAll(next)
        setAgreeAge(next)
        setAgreeTerms(next)
        setAgreePrivacy(next)
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
    }

    const supabase = createClient()

    const handleSocialLogin = async (provider: 'google' | 'kakao') => {
        if (!allChecked) {
            setError('필수 약관에 모두 동의해주세요.')
            return
        }
        // 약관 동의 기록 저장 (다음 로그인 때 건너뛰기)
        localStorage.setItem('curi_terms_agreed', 'true')
        localStorage.setItem('curi_last_provider', provider)
        setIsLoading(provider)
        setError('')
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
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
                <div style={{ fontSize: 28, marginBottom: 4 }}>🎁</div>
                <div style={{
                    fontSize: 17, fontWeight: 800, color: '#15803d',
                    letterSpacing: '-0.02em',
                }}>
                    4월 30일까지 무료체험 이벤트 진행 중!
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                    나만의 AI를 만들고 대화해 보세요
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
                    <img
                        src="/logo.png"
                        alt="큐리 AI"
                        style={{
                            width: 80, height: 80, objectFit: 'contain',
                            marginBottom: 16,
                            display: 'block', margin: '0 auto 16px',
                        }}
                    />
                    <h1 style={{
                        fontSize: 28, fontWeight: 800, color: '#18181b',
                        letterSpacing: '-0.03em', marginBottom: 6,
                    }}>
                        큐리 AI
                    </h1>
                    <p style={{ fontSize: 15, color: '#9ca3af', lineHeight: 1.6 }}>
                        나만의 AI를 만들어보세요
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div style={{
                        padding: '12px 16px', marginBottom: 16,
                        background: '#fef2f2', color: '#991b1b',
                        borderRadius: 12, fontSize: 14, textAlign: 'center',
                    }}>
                        {error}
                    </div>
                )}

                {/* 약관 동의 — 처음 동의한 적 없을 때만 표시 */}
                {!hasAgreedBefore && (
                <div style={{
                    background: '#f9fafb',
                    borderRadius: 16,
                    padding: '16px 18px',
                    marginBottom: 20,
                    border: '1px solid #f3f4f6',
                }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 14 }}>
                        약관 및 개인정보 처리방침
                    </div>

                    {/* 모두 동의 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 0',
                        borderBottom: '1px solid #e5e7eb',
                        cursor: 'pointer', userSelect: 'none',
                        marginBottom: 8,
                    }}>
                        <input
                            type="checkbox"
                            checked={agreeAll}
                            onChange={handleAgreeAll}
                            style={{
                                width: 20, height: 20, borderRadius: 4,
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#18181b' }}>
                            모두 동의
                        </span>
                    </label>

                    {/* 만 14세 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreeAge}
                            onChange={() => handleIndividual(setAgreeAge, agreeAge, agreeTerms, agreePrivacy, 'age')}
                            style={{
                                width: 18, height: 18, borderRadius: 4,
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 14, color: '#374151' }}>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>*</span> 만 14세 이상임을 확인합니다.
                        </span>
                    </label>

                    {/* 이용약관 */}
                    <label style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreeTerms}
                            onChange={() => handleIndividual(setAgreeTerms, agreeAge, agreeTerms, agreePrivacy, 'terms')}
                            style={{
                                width: 18, height: 18, borderRadius: 4,
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 14, color: '#374151' }}>
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
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 0', cursor: 'pointer', userSelect: 'none',
                    }}>
                        <input
                            type="checkbox"
                            checked={agreePrivacy}
                            onChange={() => handleIndividual(setAgreePrivacy, agreeAge, agreeTerms, agreePrivacy, 'privacy')}
                            style={{
                                width: 18, height: 18, borderRadius: 4,
                                accentColor: '#16a34a', cursor: 'pointer',
                            }}
                        />
                        <span style={{ fontSize: 14, color: '#374151' }}>
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

                {/* Social Login */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Google */}
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('google')}
                        disabled={isLoading !== null || !allChecked}
                        style={{
                            width: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                            padding: '16px 24px', fontSize: 17, fontWeight: 600,
                            borderRadius: 16,
                            background: allChecked ? '#fff' : '#f3f4f6',
                            color: allChecked ? '#1a1a2e' : '#9ca3af',
                            border: `1.5px solid ${allChecked ? '#e5e7eb' : '#e5e7eb'}`,
                            boxShadow: allChecked ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                            cursor: allChecked ? 'pointer' : 'not-allowed',
                            transition: 'all 200ms',
                            opacity: isLoading !== null ? 0.5 : 1,
                        }}
                    >
                        {isLoading === 'google' ? (
                            <div style={{
                                width: 20, height: 20, borderRadius: '50%',
                                border: '2px solid #d1d5db', borderTopColor: '#22c55e',
                                animation: 'spin 0.8s linear infinite',
                            }} />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M19.6 10.23c0-.68-.06-1.36-.17-2.02H10v3.83h5.38a4.6 4.6 0 01-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.33z" fill="#4285F4" />
                                <path d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.89.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H1.08v2.58A9.99 9.99 0 0010 20z" fill="#34A853" />
                                <path d="M4.42 11.9A6.01 6.01 0 014.1 10c0-.66.11-1.3.32-1.9V5.52H1.08A9.99 9.99 0 000 10c0 1.61.39 3.14 1.08 4.48l3.34-2.58z" fill="#FBBC05" />
                                <path d="M10 3.98c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.96 9.96 0 0010 0 9.99 9.99 0 001.08 5.52l3.34 2.58C5.2 5.74 7.4 3.98 10 3.98z" fill="#EA4335" />
                            </svg>
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

                    {/* Kakao */}
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('kakao')}
                        disabled={isLoading !== null || !allChecked}
                        style={{
                            width: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                            padding: '16px 24px', fontSize: 17, fontWeight: 600,
                            borderRadius: 16,
                            background: allChecked ? '#FEE500' : '#f3f4f6',
                            color: allChecked ? '#191919' : '#9ca3af',
                            border: 'none',
                            boxShadow: allChecked ? '0 1px 3px rgba(0,0,0,0.04)' : 'none',
                            cursor: allChecked ? 'pointer' : 'not-allowed',
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
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M10 1C4.93 1 0.833 4.213 0.833 8.167c0 2.544 1.697 4.78 4.25 6.04-.149.533-.96 3.427-.992 3.64 0 0-.02.165.088.228.107.063.234.014.234.014.309-.043 3.578-2.34 4.145-2.739.464.066.94.1 1.442.1 5.07 0 9.167-3.213 9.167-7.283C19.167 4.213 15.07 1 10 1z" fill="#191919"/>
                            </svg>
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
                </div>




                {/* Skip */}
                <Link
                    href="/mentors"
                    style={{
                        display: 'block', width: '100%',
                        padding: 12, fontSize: 15, marginTop: 0,
                        color: '#9ca3af', textAlign: 'center',
                        textDecoration: 'none', transition: 'color 200ms',
                    }}
                >
                    먼저 둘러볼게요 →
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
                    <div>유선번호 : 1533-0701</div>
                    <div style={{ wordBreak: 'keep-all' }}>
                        사무실 : 서울특별시 마포구 신촌로2길 19 플랫폼D 서울디자인창업센터 4층
                    </div>
                </div>

                {/* 정책 링크 */}
                <div style={{
                    display: 'flex', gap: 4, marginTop: 14,
                    fontSize: 12,
                }}>
                    <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600 }}>
                        개인정보처리방침
                    </Link>
                    <span style={{ color: '#d1d5db' }}>ㅣ</span>
                    <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>
                        서비스이용약관
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
