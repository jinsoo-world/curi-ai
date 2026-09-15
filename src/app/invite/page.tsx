'use client'

/**
 * 친구 부르기 — 내 추천코드와 성적
 *
 * 대표 지시 2026-09-15 = 「어필리에이트도 만들자. 아까 회원추천코드」
 *
 * 리더가 자기 사람들에게 큐리AI 를 권할 통로다. 코드는 이미 users.referral_code 에 있고
 * 없으면 /api/referral 이 만들어 준다.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppSidebar from '@/components/AppSidebar'
import ShareInvite from '@/components/ui/ShareInvite'
import CloverIcon from '@/components/ui/CloverIcon'
import { REFERRER_REWARD } from '@/domains/trial'

export default function InvitePage() {
    const [코드, set코드] = useState<string | null>(null)
    const [부른수, set부른수] = useState<number | null>(null)
    const [오류, set오류] = useState<string | null>(null)

    useEffect(() => {
        let 살아있음 = true
        ;(async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                if (살아있음) set오류('로그인하면 내 추천코드를 받을 수 있어요.')
                return
            }

            // 코드가 없으면 만들어 준다
            let c: string | null = null
            const { data: me } = await supabase.from('users').select('referral_code').eq('id', user.id).maybeSingle()
            c = me?.referral_code ?? null
            if (!c) {
                try {
                    const res = await fetch('/api/referral', { method: 'POST' })
                    const d = await res.json()
                    c = d.referral_code ?? null
                } catch { /* 못 만들면 아래에서 안내한다 */ }
            }
            if (!살아있음) return
            if (!c) { set오류('추천코드를 만들지 못했어요. 잠시 뒤 다시 열어주세요.'); return }
            set코드(c)

            // 내 코드로 체험권을 받은 사람 수
            const { count } = await supabase
                .from('users')
                .select('id', { count: 'exact', head: true })
                .eq('trial_referrer_id', user.id)
            if (살아있음) set부른수(count ?? 0)
        })()
        return () => { 살아있음 = false }
    }, [])

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 18px 90px' }}>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
                    친구 부르기
                </h1>
                <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)', margin: '0 0 24px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    친구가 가입 시, {REFERRER_REWARD}클로버를 더 드려요! 내 주소로 들어와 휴대폰 인증을 하면 됩니다. 몇 명이든 괜찮습니다.
                </p>

                {부른수 !== null && (
                    <div style={{
                        background: '#fff', border: '1px solid var(--선)', borderRadius: 16,
                        padding: '18px 20px', marginBottom: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--먹연)' }}>지금까지 부른 사람</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 22, fontWeight: 900 }}>{부른수}명</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 800, color: 'var(--진초록)' }}>
                                <CloverIcon size={15} /> {(부른수 * REFERRER_REWARD).toLocaleString()}개
                            </span>
                        </span>
                    </div>
                )}

                {코드 ? (
                    <ShareInvite code={코드} />
                ) : (
                    <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)', lineHeight: 1.6 }}>
                        {오류 ?? '잠시만요…'}
                    </p>
                )}
            </div>
        </main>
    )
}
