'use client'
// 에이전트 OS 뼈대 = 왼쪽 봇 명단(격자) + 가운데(자식 화면). 그록봇 화면 실측(기획 §13).
// 팀 명단은 여기서 한 번 불러 아래 화면(대화·세부칸)이 useOsTeam() 으로 같이 쓴다.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { TeamBot } from '@/domains/os/types'
import BotAvatar from './BotAvatar'
import NewBotSheet from './NewBotSheet'
import GuestRoster from './GuestRoster'
import './os.css'

interface TeamState {
    team: TeamBot[]
    loading: boolean
    guest: boolean
    tableMissing: boolean
    refresh: () => Promise<void>
    openNewBot: () => void
}


/**
 * 시연 모드 (/os?demo=1) = 표(team_bots)가 아직 없어도 격자·캐릭터·대화를 볼 수 있게
 * 공개 봇 3개를 팀처럼 보여준다. 대화는 진짜 /api/chat(공개 봇)로 간다. 저장은 안 한다.
 */
const DEMO_TEAM: TeamBot[] = [
    { id: 'demo-1', mentorId: '118bef35-26bc-4118-a446-aa96e977f9ee', name: '오재현', role: 'chief', shape: 'clover', color: 'green', oneLiner: '얼굴 안 나와도 영상은 됩니다', approvalMode: 'always_ask', pinned: true, hidden: false, sortOrder: 0, avatarUrl: null, greeting: '안녕하세요, 오재현입니다. 유튜브 이야기라면 무엇이든 물어보세요.', knowledgeCount: 0, createdAt: '' },
    { id: 'demo-2', mentorId: '20728d0a-2aed-4c4c-bc48-f26be076d0bc', name: '임보라', role: 'helper', shape: 'circle', color: 'orange', oneLiner: '하루 세 줄로 시작해요', approvalMode: 'always_ask', pinned: true, hidden: false, sortOrder: 1, avatarUrl: null, greeting: '안녕하세요, 임보라예요. 스레드 글, 오늘 세 줄부터 써 볼까요?', knowledgeCount: 0, createdAt: '' },
    { id: 'demo-3', mentorId: '264ae26a-1b77-489c-abbd-9662b0b42e4c', name: '유선희', role: 'helper', shape: 'hex', color: 'blue', oneLiner: '내 경험을 한 권으로 묶어요', approvalMode: 'draft_only', pinned: true, hidden: false, sortOrder: 2, avatarUrl: null, greeting: '안녕하세요, 유선희입니다. 어떤 경험을 책으로 묶고 싶으세요?', knowledgeCount: 0, createdAt: '' },
]

const Ctx = createContext<TeamState | null>(null)
export function useOsTeam(): TeamState {
    const v = useContext(Ctx)
    if (!v) throw new Error('useOsTeam 은 OsShell 안에서만 쓴다')
    return v
}

export default function OsShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '/os'
    const router = useRouter()
    const [team, setTeam] = useState<TeamBot[]>([])
    const [loading, setLoading] = useState(true)
    const [guest, setGuest] = useState(false)
    const [tableMissing, setTableMissing] = useState(false)
    const [sheet, setSheet] = useState(false)
    const [query, setQuery] = useState('')

    const refresh = useCallback(async () => {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1') {
            setTeam(DEMO_TEAM); setGuest(false); setTableMissing(false); setLoading(false)
            return
        }
        try {
            const res = await fetch('/api/os/team', { cache: 'no-store' })
            const data = await res.json()
            setTeam(Array.isArray(data.team) ? data.team : [])
            setGuest(!!data.guest)
            setTableMissing(!!data.tableMissing)
        } catch {
            setTeam([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { void refresh() }, [refresh])

    // ⌘/Ctrl + N = 새 봇 (그록봇의 ⌘1 문법을 한 키로)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setSheet(true) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const visible = useMemo(() => {
        const q = query.trim()
        return team
            .filter(b => !b.hidden)
            .filter(b => !q || b.name.includes(q) || (b.oneLiner ?? '').includes(q))
    }, [team, query])

    const value = useMemo<TeamState>(() => ({
        team, loading, guest, tableMissing, refresh, openNewBot: () => setSheet(true),
    }), [team, loading, guest, tableMissing, refresh])

    // 손님 소개 화면(/os/welcome)은 한 장짜리라 뼈대(왼쪽 명단) 없이 그린다
    if (pathname.startsWith('/os/welcome')) return <>{children}</>

    return (
        <Ctx.Provider value={value}>
            <div className="os-shell" data-theme="os">
                <aside className="os-left" style={{ position: 'relative' }}>
                    <button className="os-plus" aria-label="새 봇 또는 그룹 만들기" title="새 봇 (⌘N)" onClick={() => setSheet(true)}>＋</button>
                    <label className="os-search">
                        <span aria-hidden>🔍</span>
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="검색"
                            style={{ background: 'transparent', border: 0, outline: 0, color: 'inherit', fontSize: 15, flex: 1 }}
                        />
                    </label>

                    {tableMissing && (
                        <div className="os-notice">봇 팀 표가 아직 준비 중이에요. 관리자가 표를 적용하면 바로 쓸 수 있어요.</div>
                    )}

                    <div className="os-roster" role="list">
                        {visible.map(b => {
                            const demo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'
                            const href = `/os/chat/${b.mentorId}${demo ? '?demo=1' : ''}`
                            const current = pathname === href
                            return (
                                <button
                                    key={b.id}
                                    role="listitem"
                                    className="os-bot-tile"
                                    aria-current={current}
                                    onClick={() => router.push(href)}
                                    title={b.oneLiner ?? b.name}
                                >
                                    <BotAvatar shape={b.shape} color={b.color} state={current ? 'listening' : 'idle'} size={72} faceUrl={b.avatarUrl} />
                                    <span className="os-bot-name">{b.name}</span>
                                    {b.oneLiner && <span className="os-chip">{b.oneLiner}</span>}
                                </button>
                            )
                        })}
                        {!loading && visible.length === 0 && !guest && (
                            <div style={{ gridColumn: '1 / -1', color: 'var(--os-글-흐림)', fontSize: 14, padding: '20px 8px', textAlign: 'center', lineHeight: 1.6 }}>
                                아직 팀이 없어요.<br />오른쪽 위 ＋ 로 첫 봇을 만들어요.
                            </div>
                        )}
                        {!loading && guest && (
                            <div style={{ gridColumn: '1 / -1', color: 'var(--os-글-흐림)', fontSize: 14, padding: '20px 8px', textAlign: 'center', lineHeight: 1.6 }}>
                                로그인하면 내 봇 팀이 여기 모여요.
                            </div>
                        )}
                        {!loading && guest && <GuestRoster />}
                    </div>

                    <div className="os-left-bottom">
                        <Link href="/mentors" className="os-row-btn" style={{ textDecoration: 'none' }}>🏪 <span>둘러보기 (리더들의 봇)</span></Link>
                        {guest
                            ? <Link href="/login?next=/os" className="os-row-btn" style={{ textDecoration: 'none' }}>👤 <span>로그인</span></Link>
                            : <Link href="/profile" className="os-row-btn" style={{ textDecoration: 'none' }}>👤 <span>내 계정</span></Link>}
                    </div>
                </aside>

                <section className="os-main">{children}</section>

                {sheet && (
                    <NewBotSheet
                        guest={guest}
                        onClose={() => setSheet(false)}
                        onCreated={async (bot) => { setSheet(false); await refresh(); router.push(`/os/chat/${bot.mentorId}`) }}
                    />
                )}
            </div>
        </Ctx.Provider>
    )
}
