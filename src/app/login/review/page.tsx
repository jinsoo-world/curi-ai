'use client'

// 카드사 심사용 로그인 — 2026-09-15 신설
//
// 왜 필요한가 = 토스 MID 신청서가 「결제창 진입이 가능한 테스트 계정(아이디/비밀번호)」을 요구하는데
// 큐리AI 는 구글·카카오 버튼으로만 들어가게 돼 있어서 아이디와 비밀번호 한 쌍이 없었다.
//
// 왜 /login 이 아니라 여기인가 = 일반 고객 화면은 소셜 두 개로 단순하게 두기로 한 제품 결정을 지킨다.
// 이 주소를 아는 사람(심사관)만 들어온다. 검색에도 안 걸리게 robots 를 막았다.
//
// ⛔ 심사가 끝나면 이 계정의 비밀번호를 바꾸거나 계정을 지운다. 지금은 심사관이 써야 해서 열어둔다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ReviewLoginPage() {
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setErrorMsg(null)
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            setErrorMsg('아이디 또는 비밀번호가 맞지 않습니다.')
            setLoading(false)
            return
        }
        router.push('/charge')
        router.refresh()
    }

    return (
        <main style={{
            minHeight: '100dvh', background: '#f8f9fa',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
        }}>
            <form
                onSubmit={handleLogin}
                style={{
                    width: '100%', maxWidth: 360,
                    background: '#fff', borderRadius: 20,
                    border: '1px solid #f0f0f0',
                    padding: 32,
                }}
            >
                <h1 style={{
                    fontSize: 20, fontWeight: 800, color: '#18181b',
                    margin: '0 0 6px', letterSpacing: '-0.02em',
                }}>
                    🤖 큐리 AI
                </h1>
                <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 24px' }}>
                    심사용 로그인
                </p>

                <label style={{ display: 'block', fontSize: 13, color: '#52525b', marginBottom: 6 }}>
                    아이디(이메일)
                </label>
                <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    style={{
                        width: '100%', padding: '12px 14px', marginBottom: 16,
                        borderRadius: 12, border: '1px solid #e4e4e7',
                        fontSize: 15, boxSizing: 'border-box',
                    }}
                />

                <label style={{ display: 'block', fontSize: 13, color: '#52525b', marginBottom: 6 }}>
                    비밀번호
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    style={{
                        width: '100%', padding: '12px 14px', marginBottom: 20,
                        borderRadius: 12, border: '1px solid #e4e4e7',
                        fontSize: 15, boxSizing: 'border-box',
                    }}
                />

                {errorMsg && (
                    <div style={{
                        background: '#fef2f2', color: '#dc2626', fontSize: 13,
                        padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                    }}>
                        {errorMsg}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%', padding: 14, borderRadius: 14, border: 'none',
                        background: loading ? '#a1a1aa' : '#22c55e', color: '#fff',
                        fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
                    }}
                >
                    {loading ? '들어가는 중...' : '로그인'}
                </button>
            </form>
        </main>
    )
}
