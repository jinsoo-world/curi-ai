'use client'
// 설정 (/os/settings) = 일반 / 알림 / 사용량 / 로그아웃. 왼쪽 명단 아래 「⚙ 설정」으로 들어온다.
// 손님 = 4060 강사, 작가. 글자는 크게, 단추는 44px 이상, 색은 [data-theme="os"] 토큰만.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCreditBalance } from '@/domains/credit'
import { FONT_LABELS, FONT_SIZES, OS_TIMEZONE, applyFontSize, readFontSize, saveFontSize, type FontSize } from '@/domains/os/settings'
import { isLowClover } from '@/domains/credit/charge-flow'
import NotificationSettings from '@/components/os/NotificationSettings'
import ConnectorsPanel from '@/components/os/ConnectorsPanel'
import type { ApprovalMode, TeamBot } from '@/domains/os/types'
import '@/components/os/settings.css'

/** 승인 모드 3가지. 라디오 이름은 approval 하나로 묶는다 */
const APPROVAL_OPTIONS: { value: ApprovalMode; label: string; sub: string }[] = [
    { value: 'always_ask', label: '항상 물어보기', sub: '보내기, 게시, 구매, 이체, 삭제는 카드로 묻고 내가 허용해야 나가요.' },
    { value: 'draft_only', label: '초안만 만들기', sub: '봇은 글만 써 두고, 밖으로는 아무것도 안 보내요.' },
    { value: 'auto_safe', label: '되돌릴 수 있는 일은 알아서', sub: '지금은 「항상 물어보기」와 같게 움직여요. 나중에 열려요.' },
]

export default function OsSettingsPage() {
    const router = useRouter()
    const [font, setFont] = useState<FontSize>('normal')
    const [balance, setBalance] = useState<number | null>(null)
    const [guest, setGuest] = useState(false)
    const [checked, setChecked] = useState(false)
    /** 내 봇 명단(승인 모드를 봇마다 저장하므로 필요). null = 아직 못 읽음 */
    const [team, setTeam] = useState<TeamBot[] | null>(null)
    const [approvalNote, setApprovalNote] = useState<string | null>(null)

    const loadTeam = useCallback(async () => {
        try {
            const r = await fetch('/api/os/team', { cache: 'no-store' })
            const d = await r.json().catch(() => ({}))
            setTeam(Array.isArray(d?.team) ? d.team as TeamBot[] : [])
        } catch { setTeam([]) }
    }, [])
    useEffect(() => { void Promise.resolve().then(loadTeam) }, [loadTeam])

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

    /** 승인 모드: 누르면 화면이 먼저 바뀌고, 봇마다 저장은 뒤에서. 하나라도 실패하면 되돌린다 */
    const 승인모드바꾸기 = async (mode: ApprovalMode) => {
        if (!team || team.length === 0) return
        const 이전 = team
        setApprovalNote(null)
        setTeam(team.map(b => ({ ...b, approvalMode: mode })))
        const 결과 = await Promise.all(이전.map(b =>
            fetch(`/api/os/team/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalMode: mode }) })
                .then(r => r.ok).catch(() => false),
        ))
        if (결과.some(ok => !ok)) { setTeam(이전); setApprovalNote('저장 못 했어요. 잠시 뒤 다시 눌러 주세요.') }
    }

    /** 봇들의 승인 모드가 전부 같으면 그 값, 다르면 null(아무것도 안 고른 채로 보인다) */
    const 현재승인모드: ApprovalMode | null = team && team.length > 0 && team.every(b => b.approvalMode === team[0].approvalMode)
        ? team[0].approvalMode : null
    const 승인못고르는이유 = guest ? '로그인하면 고를 수 있어요.'
        : team && team.length === 0 ? '봇을 먼저 만들면 고를 수 있어요.'
        : null

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
                    <div><b>시간대</b><div className="os-set-sub">루틴과 이번 주가 보는 달력이에요.</div></div>
                    <span>{OS_TIMEZONE} (한국)</span>
                </div>
            </div>

            <div className="os-card" style={{ marginTop: 8 }}>
                <div className="os-set-row">
                    <div>
                        <b>승인 모드</b>
                        <div className="os-set-sub">
                            {team && team.length > 1 ? `내 봇 ${team.length}개에 같이 적용돼요.` : '봇이 밖으로 무언가 보내기 전에 어떻게 할지 정해요.'}
                            {현재승인모드 === null && team && team.length > 1 && ' 지금은 봇마다 달라요. 하나를 고르면 전부 맞춰져요.'}
                        </div>
                    </div>
                </div>
                <div className="os-approval" role="radiogroup" aria-label="승인 모드">
                    {APPROVAL_OPTIONS.map(o => (
                        <label key={o.value}>
                            <input type="radio" name="approval" value={o.value} checked={현재승인모드 === o.value}
                                disabled={!!승인못고르는이유 || team === null} onChange={() => void 승인모드바꾸기(o.value)} />
                            <span>
                                <b>{o.label}</b>
                                <div className="os-set-sub">{o.sub}</div>
                            </span>
                        </label>
                    ))}
                </div>
                {승인못고르는이유 && <div className="os-set-hint" style={{ marginTop: 8 }}>{승인못고르는이유}</div>}
                {approvalNote && <div className="os-set-hint warn" style={{ marginTop: 8 }}>{approvalNote}</div>}
            </div>

            <h2>연결</h2>
            <ConnectorsPanel />

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
