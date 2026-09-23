'use client'
// 설정 (/os/settings) = 일반 / 알림 / 사용량 / 로그아웃. 왼쪽 명단 아래 「⚙ 설정」으로 들어온다.
// 손님 = 4060 강사, 작가. 글자는 크게, 단추는 44px 이상, 색은 [data-theme="os"] 토큰만.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCreditBalance } from '@/domains/credit'
import { FONT_LABELS, FONT_SIZES, OS_TIMEZONE, applyFontSize, readFontSize, saveFontSize, type FontSize } from '@/domains/os/settings'
import { isLowClover } from '@/domains/credit/charge-flow'
import NotificationSettings from '@/components/os/NotificationSettings'

export default function OsSettingsPage() {
    const router = useRouter()
    const [font, setFont] = useState<FontSize>('normal')
    const [balance, setBalance] = useState<number | null>(null)
    const [guest, setGuest] = useState(false)
    const [checked, setChecked] = useState(false)

    // 저장해 둔 글자 크기를 화면에 되살린다
    // 효과 본문에서 바로 setState 하지 않는다(린트 규칙) — 한 박자 뒤에 되살린다
    useEffect(() => {
        void Promise.resolve().then(() => {
            const 값 = readFontSize(window.localStorage)
            applyFontSize(document.documentElement, 값)
            setFont(값)
        })
    }, [])

    useEffect(() => {
        let alive = true
        const supabase = createClient()
        supabase.auth.getUser().then(async ({ data }) => {
            if (!alive) return
            if (!data.user) { setGuest(true); setChecked(true); return }
            setChecked(true)
            try { const n = await getCreditBalance(); if (alive) setBalance(n) } catch { /* 못 읽어도 화면은 산다 */ }
        }).catch(() => { if (alive) setChecked(true) })
        return () => { alive = false }
    }, [])

    const 글자바꾸기 = (v: FontSize) => {
        const 값 = saveFontSize(v, typeof window === 'undefined' ? null : window.localStorage)
        applyFontSize(document.documentElement, 값)
        setFont(값)
    }

    const 로그아웃 = async () => {
        if (!confirm('로그아웃 할까요?')) return
        await createClient().auth.signOut()
        router.push('/')
        router.refresh()
    }

    return (
        <div className="os-settings">
            <h1>설정</h1>

            <h2>일반</h2>
            <div className="os-card">
                <div className="os-set-row">
                    <div>
                        <b>글자 크기</b>
                        <div className="os-set-sub">대화 글자가 커지고 작아져요.</div>
                    </div>
                </div>
                <div className="os-chips" style={{ marginTop: 10 }}>
                    {FONT_SIZES.map(s => (
                        <button key={s} type="button" className="os-chipbtn" aria-pressed={font === s}
                            style={{ minHeight: 44, padding: '10px 16px' }} onClick={() => 글자바꾸기(s)}>{FONT_LABELS[s]}</button>
                    ))}
                </div>
            </div>

            <div className="os-card" style={{ marginTop: 8 }}>
                <div className="os-set-row">
                    <div><b>시간대</b><div className="os-set-sub">루틴, 체크인, 이번 주가 보는 달력이에요.</div></div>
                    <span>{OS_TIMEZONE} (한국)</span>
                </div>
            </div>

            <div className="os-card" style={{ marginTop: 8 }}>
                <div className="os-set-row">
                    <div>
                        <b>승인 모드</b>
                        <div className="os-set-sub">보내기, 게시, 구매, 이체, 삭제는 카드로 물어보고, 내가 허용해야만 나가요.</div>
                    </div>
                    <button type="button" role="switch" aria-checked aria-disabled className="os-routine-switch" data-on="true" disabled
                        aria-label="승인 모드 (지금은 끌 수 없어요)"><span /></button>
                </div>
                <div className="os-set-sub" style={{ marginTop: 8 }}>지금은 끌 수 없어요. 나중에 열려요.</div>
            </div>

            <h2>알림</h2>
            <NotificationSettings />

            <h2>사용량</h2>
            <div className="os-card">
                <div className="os-set-row">
                    <div><b>클로버 잔량</b><div className="os-set-sub">봇에게 말을 걸 때 쓰는 우리 재화예요.</div></div>
                    <span style={isLowClover(balance) ? { color: 'var(--os-경고)' } : undefined}>
                        {guest ? '로그인하면 보여요' : balance === null ? '읽는 중…' : `🍀 ${balance}개`}
                    </span>
                </div>
                <Link href="/os/charge?from=/os/settings" className="os-btn primary"
                    style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none', lineHeight: '24px' }}>클로버 충전하기</Link>
                <div className="os-set-sub" style={{ marginTop: 10 }}>이번 달에 쓴 개수는 곧 보여 드릴게요.</div>
            </div>

            {checked && !guest && (
                <>
                    <h2>계정</h2>
                    <div className="os-card">
                        <Link href="/profile" className="os-row-btn" style={{ textDecoration: 'none' }}>👤 <span>내 계정</span></Link>
                        <button className="os-row-btn" onClick={() => void 로그아웃()}>↩ <span>로그아웃</span></button>
                    </div>
                </>
            )}
            {checked && guest && (
                <>
                    <h2>계정</h2>
                    <div className="os-card">
                        <Link href="/login?next=/os" className="os-row-btn" style={{ textDecoration: 'none' }}>👤 <span>로그인</span></Link>
                    </div>
                </>
            )}
        </div>
    )
}
