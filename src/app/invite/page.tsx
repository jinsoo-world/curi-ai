'use client'

/**
 * 친구 부르기 — 내 추천코드와 성적
 *
 * 대표 지시 2026-09-15 = 「어필리에이트도 만들자. 아까 회원추천코드」
 * 대표 지시 2026-09-16 = 「렌트리 참고해서 개선해줘」
 *
 * 렌트리의 친구초대 화면에서 가져온 것 세 가지 —
 *   ① 성적을 맨 위 색면에 크게(몇 명·클로버 몇 개)  ② 부른 사람이 언제 들어왔는지 이력으로 보여준다
 *   ③ 아직 아무도 없을 때도 빈 화면이 아니라 「여기에 뜰 거예요」로 다음을 알려준다
 * 렌트리는 월 5회 상한이 있어 진행 막대를 쓴다. 우리는 상한이 없어 막대 대신 누적 숫자를 키웠다.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AppSidebar from '@/components/AppSidebar'
import ShareInvite from '@/components/ui/ShareInvite'
import { REFERRER_REWARD } from '@/domains/trial'

export default function InvitePage() {
    const [코드, set코드] = useState<string | null>(null)
    const [이력, set이력] = useState<string[]>([])
    const [오류, set오류] = useState<string | null>(null)
    const [로그인함, set로그인함] = useState<boolean | null>(null)
    const [친구수, set친구수] = useState<number | null>(null)

    useEffect(() => {
        let 살아있음 = true
        ;(async () => {
            const supabase = createClient()
            const { data: { session } } = await supabase.auth.getSession()
            const user = session?.user ?? null
            if (살아있음) set로그인함(!!user)
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

            // 들어온 친구 수 — /api/referral 실제 값
            try {
                const r = await fetch('/api/referral')
                if (r.ok) {
                    const d = await r.json()
                    if (살아있음) set친구수(typeof d.friends_invited === 'number' ? d.friends_invited : null)
                }
            } catch { /* 수를 못 가져오면 아래 목록만 보여준다 */ }

            // 내 코드로 체험권을 받은 사람 — 수와 들어온 날
            // 남의 이름·연락처는 가져오지 않는다. 언제 들어왔는지만 본다.
            const { data: 온사람 } = await supabase
                .from('users')
                .select('created_at')
                .eq('trial_referrer_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20)
            if (!살아있음) return
            set이력((온사람 ?? []).map((r: { created_at: string }) => r.created_at))
        })()
        return () => { 살아있음 = false }
    }, [])

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 18px 120px' }}>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
                    친구초대
                </h1>
                <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)', margin: '0 0 20px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    내 주소를 친구에게 보내 큐리AI를 알려 주세요.
                </p>

                {/* 추천 보상 안내 — 대표 확정(D2): 친구가 휴대폰 인증까지 마치면 한 번 준다 */}
                <div style={{
                    background: 'var(--진초록, #166534)', color: '#fff', borderRadius: 18,
                    padding: '18px 20px', marginBottom: 16, fontSize: 17, fontWeight: 800, lineHeight: 1.5, wordBreak: 'keep-all',
                }}>
                    친구가 가입하고 휴대폰 인증을 마치면 클로버 {REFERRER_REWARD}개를 드려요
                </div>
                {/* ─── 부른 사람 이력 (렌트리 참고) ─── */}
                {로그인함 !== false && <div style={{
                    background: '#fff', border: '1px solid var(--선)', borderRadius: 18,
                    padding: '18px 20px', marginBottom: 20,
                }}>
                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>들어온 친구{친구수 !== null ? ` ${친구수}명` : ''}</div>
                    {이력.length === 0 ? (
                        <div style={{ padding: '26px 0 22px', textAlign: 'center' }}>
                            <p style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px' }}>아직 들어온 친구가 없어요</p>
                            <p style={{ fontSize: 13.5, color: 'var(--먹연)', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                                아래 단추로 주소를 보내보세요. 친구가 들어오면 여기에 하나씩 쌓입니다.
                            </p>
                        </div>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {이력.map((날, i) => (
                                <li key={i} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    gap: 10, padding: '11px 0',
                                    borderTop: i === 0 ? 'none' : '1px solid var(--선)',
                                }}>
                                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>
                                        {new Date(날).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}에 들어왔어요
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>}

                {코드 ? (
                    <ShareInvite code={코드} />
                ) : 로그인함 === false ? (
                    // 로그인 안 한 분 — 채팅·보관함과 같은 모양으로 (대표 모바일 점검 2026-09-16)
                    <div style={{
                        background: '#fff', border: '1px solid var(--선)', borderRadius: 18,
                        padding: '40px 24px 36px', textAlign: 'center',
                    }}>
                        <p style={{ fontSize: 17, fontWeight: 800, margin: '0 0 7px' }}>로그인하면 내 주소가 생겨요</p>
                        <p style={{ fontSize: 14.5, color: 'var(--먹연)', margin: '0 0 20px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            그 주소를 친구에게 보내 큐리AI를 알려 줄 수 있어요.
                        </p>
                        <Link href="/login" style={{
                            display: 'inline-block', background: 'var(--먹)', color: '#fff',
                            padding: '13px 26px', borderRadius: 999, fontWeight: 800, fontSize: 15.5, textDecoration: 'none',
                        }}>로그인하기</Link>
                    </div>
                ) : (
                    <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹연)', lineHeight: 1.6 }}>
                        {오류 ?? '잠시만요…'}
                    </p>
                )}
            </div>
        </main>
    )
}
