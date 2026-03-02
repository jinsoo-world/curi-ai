'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState<string | null>(null)
    const [error, setError] = useState('')
    const supabase = createClient()

    const handleSocialLogin = async (provider: 'google' | 'kakao') => {
        setIsLoading(provider)
        setError('')
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider,
                options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
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
        <main className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50 relative">
            {/* Background decoration */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute rounded-full"
                    style={{
                        width: 320, height: 320, top: -120, right: -100,
                        background: 'rgba(187, 247, 208, 0.25)', filter: 'blur(80px)',
                    }}
                />
                <div
                    className="absolute rounded-full"
                    style={{
                        width: 280, height: 280, bottom: -100, left: -80,
                        background: 'rgba(220, 252, 231, 0.3)', filter: 'blur(80px)',
                    }}
                />
            </div>

            {/* Card */}
            <div
                className="relative z-10 w-full max-w-sm bg-white rounded-3xl animate-fade-in"
                style={{
                    padding: '48px 32px 36px',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)',
                }}
            >
                {/* Logo */}
                <div className="text-center mb-10">
                    <div
                        className="inline-flex items-center justify-center rounded-2xl mb-6"
                        style={{
                            width: 72, height: 72,
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            boxShadow: '0 8px 24px rgba(34,197,94,0.25)',
                        }}
                    >
                        <span className="text-3xl">🎓</span>
                    </div>
                    <h1
                        className="font-extrabold text-gray-900 mb-2"
                        style={{ fontSize: 32, letterSpacing: '-0.03em' }}
                    >
                        큐리 AI
                    </h1>
                    <p className="text-gray-500" style={{ fontSize: 17, lineHeight: 1.6 }}>
                        언제든, 나를 아는 멘토에게
                        <br />
                        <span className="text-green-600 font-semibold">물어보세요</span>
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div
                        role="alert"
                        className="mb-5 rounded-xl text-center"
                        style={{ padding: '12px 16px', background: '#fef2f2', color: '#991b1b', fontSize: 14 }}
                    >
                        {error}
                    </div>
                )}

                {/* Social Login Buttons */}
                <div className="flex flex-col gap-3">
                    {/* 구글 */}
                    <button
                        type="button"
                        onClick={() => handleSocialLogin('google')}
                        disabled={isLoading !== null}
                        className="w-full flex items-center justify-center gap-3 rounded-2xl font-semibold cursor-pointer disabled:opacity-50"
                        style={{
                            padding: '16px 24px', fontSize: 18,
                            background: '#fff', color: '#1a1a2e',
                            border: '1.5px solid #e5e7eb',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'transform 200ms',
                        }}
                    >
                        {isLoading === 'google' ? (
                            <div
                                className="rounded-full animate-spin-slow"
                                style={{
                                    width: 20, height: 20,
                                    border: '2px solid #d1d5db',
                                    borderTopColor: '#22c55e',
                                }}
                            />
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <path d="M19.6 10.23c0-.68-.06-1.36-.17-2.02H10v3.83h5.38a4.6 4.6 0 01-2 3.02v2.5h3.24c1.89-1.74 2.98-4.3 2.98-7.33z" fill="#4285F4" />
                                <path d="M10 20c2.7 0 4.96-.9 6.62-2.44l-3.24-2.5c-.89.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H1.08v2.58A9.99 9.99 0 0010 20z" fill="#34A853" />
                                <path d="M4.42 11.9A6.01 6.01 0 014.1 10c0-.66.11-1.3.32-1.9V5.52H1.08A9.99 9.99 0 000 10c0 1.61.39 3.14 1.08 4.48l3.34-2.58z" fill="#FBBC05" />
                                <path d="M10 3.98c1.47 0 2.78.5 3.82 1.5l2.86-2.86A9.96 9.96 0 0010 0 9.99 9.99 0 001.08 5.52l3.34 2.58C5.2 5.74 7.4 3.98 10 3.98z" fill="#EA4335" />
                            </svg>
                        )}
                        Google로 시작하기
                    </button>

                    {/* 카카오 — 비즈니스 인증 승인 후 활성화 예정 */}
                    {/* 
                    <button
                        onClick={() => handleSocialLogin('kakao')}
                        disabled={isLoading !== null}
                        className="w-full flex items-center justify-center gap-3 rounded-2xl font-semibold cursor-pointer disabled:opacity-50"
                        style={{
                            padding: '16px 24px', fontSize: 18,
                            background: '#FEE500', color: '#191919',
                            border: 'none', transition: 'transform 200ms',
                        }}
                    >
                        {isLoading === 'kakao' ? (
                            <div
                                className="rounded-full animate-spin-slow"
                                style={{
                                    width: 20, height: 20,
                                    border: '2px solid rgba(25,25,25,0.2)',
                                    borderTopColor: '#191919',
                                }}
                            />
                        ) : (
                            <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
                                <path
                                    d="M10 3C5.58 3 2 5.79 2 9.21c0 2.17 1.45 4.08 3.63 5.18l-.93 3.44c-.08.3.26.54.52.37l4.13-2.74c.21.02.43.03.65.03 4.42 0 8-2.79 8-6.28S14.42 3 10 3z"
                                    fill="#191919"
                                />
                            </svg>
                        )}
                        카카오로 시작하기
                    </button>
                    */}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 my-8">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-gray-400" style={{ fontSize: 14 }}>또는</span>
                    <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* Skip */}
                <Link
                    href="/mentors"
                    className="w-full bg-transparent text-gray-400 hover:text-gray-600 block text-center"
                    style={{ padding: '12px', fontSize: 16, textDecoration: 'none', transition: 'color 200ms' }}
                >
                    먼저 둘러볼게요 →
                </Link>

                {/* Footer */}
                <p className="text-center text-gray-400 mt-8" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    시작하면{' '}
                    <a href="/terms" className="underline text-gray-400 hover:text-gray-500">이용약관</a>
                    {' '}및{' '}
                    <a href="/privacy" className="underline text-gray-400 hover:text-gray-500">개인정보처리방침</a>
                    에 동의하게 됩니다.
                </p>
            </div>
        </main>
    )
}
