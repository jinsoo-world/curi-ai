'use client'
// 에이전트 OS 뼈대 = 왼쪽 봇 명단(격자) + 가운데(자식 화면). 그록봇 화면 실측(기획 §13).
// 팀 명단은 여기서 한 번 불러 아래 화면(대화, 세부칸)이 useOsTeam() 으로 같이 쓴다.
//
// 뒤로 가기 (대표 지시 0923 「봇마켓 들어갔다가 뒤로 다시 대화로 못간다」):
//  이 뼈대 안에서는 자동 이동(router.replace)을 하지 않는다. 주소를 바꾸는 건 사람이 누른 Link 뿐이다.
//  /os 첫 화면(page.tsx)만 자기 자리를 첫 봇 대화로 바꾸고(replace, 최초 1회), 봇 마켓은 /os/market 으로 뼈대 안에서 그린다.
//  그래서 대화 → 봇 마켓 → 뒤로 = 그 봇 대화, 대화 → 설정 → 뒤로 = 복귀, 봇 A → 봇 B → 뒤로 = A.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { TeamBot } from '@/domains/os/types'
import { osTrack } from '@/domains/os/events'
import { applyFontSize, readFontSize } from '@/domains/os/settings'
import BotAvatar from './BotAvatar'
import NewBotSheet from './NewBotSheet'
import GuestRoster from './GuestRoster'
import NewGroupSheet from './NewGroupSheet'
import UsageBar from './UsageBar'
import { IconStore, IconGear, IconUser, IconLogin, IconBack, IconPlug } from './Icons'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import './os.css'
import './sidebar.css'

/** 그룹 채팅방 한 줄 (왼쪽 명단 아래에 겹친 아바타로 보인다) */
export interface ChannelView {
    id: string
    name: string
    members: { mentorId: string; name: string; shape: string; color: string; avatarUrl: string | null }[]
}

interface TeamState {
    team: TeamBot[]
    loading: boolean
    guest: boolean
    tableMissing: boolean
    refresh: () => Promise<void>
    openNewBot: () => void
    /** 그룹 채팅 (표가 아직 없으면 빈 목록) */
    channels: ChannelView[]
    refreshChannels: () => Promise<void>
    openNewGroup: () => void
}


/**
 * 시연 모드 (/os?demo=1, 그리고 이제 손님 기본) = 표(team_bots)가 아직 없어도 격자, 캐릭터, 대화를 볼 수 있게
 * 기본 팀과 같은 4명(기획팀장/홍보팀장/개발팀장/조사팀장)을 그대로 보여준다(기본 팀도 4명이라 격자가 2×2 로 같다).
 * 대화는 진짜 /api/chat(공개 봇)로 간다. 저장은 안 한다. mentorId 4개는 바뀌지 않는다 — 이름, 소개만 기본 팀과 맞췄다.
 */
const DEMO_TEAM: TeamBot[] = [
    { id: 'demo-1', mentorId: '118bef35-26bc-4118-a446-aa96e977f9ee', name: '기획팀장', role: 'helper', shape: 'clover', color: 'green', oneLiner: '방향을 잡고 결정거리를 가져와요', approvalMode: 'always_ask', pinned: true, hidden: false, sortOrder: 0, avatarUrl: null, greeting: '안녕하세요, 기획팀장이에요. 이번 주 뭐부터 할지 같이 정리해 볼까요?', knowledgeCount: 0, createdAt: '' },
    { id: 'demo-2', mentorId: '20728d0a-2aed-4c4c-bc48-f26be076d0bc', name: '홍보팀장', role: 'helper', shape: 'circle', color: 'orange', oneLiner: '알리는 글과 답장 초안을 써요', approvalMode: 'always_ask', pinned: true, hidden: false, sortOrder: 1, avatarUrl: null, greeting: '안녕하세요, 홍보팀장이에요. 다음 강의 알리는 글부터 써 드릴까요?', knowledgeCount: 0, createdAt: '' },
    { id: 'demo-3', mentorId: '264ae26a-1b77-489c-abbd-9662b0b42e4c', name: '개발팀장', role: 'helper', shape: 'hex', color: 'blue', oneLiner: '도구와 반복 일을 정리해요', approvalMode: 'draft_only', pinned: true, hidden: false, sortOrder: 2, avatarUrl: null, greeting: '안녕하세요, 개발팀장이에요. 매주 반복하는 일 중에 자동화할 것부터 찾아 드릴게요.', knowledgeCount: 0, createdAt: '' },
    { id: 'demo-4', mentorId: '509c022f-17aa-4f1a-8c86-6b8acfc8d170', name: '조사팀장', role: 'helper', shape: 'drop', color: 'yellow', oneLiner: '자료를 찾고 근거를 모아요', approvalMode: 'always_ask', pinned: true, hidden: false, sortOrder: 3, avatarUrl: null, greeting: '안녕하세요, 조사팀장이에요. 궁금한 것 있으면 자료랑 출처까지 찾아 드릴게요.', knowledgeCount: 0, createdAt: '' },
]

const Ctx = createContext<TeamState | null>(null)
export function useOsTeam(): TeamState {
    const v = useContext(Ctx)
    if (!v) throw new Error('useOsTeam 은 OsShell 안에서만 쓴다')
    return v
}

/** 우클릭(폰은 길게 누르기) 메뉴가 열린 자리 */
interface CtxMenu { bot: TeamBot; x: number; y: number }
const LONG_PRESS_MS = 500
const MOVE_CANCEL_PX = 8

export default function OsShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '/os'
    const router = useRouter()
    const [team, setTeam] = useState<TeamBot[]>([])
    const [loading, setLoading] = useState(true)
    const [guest, setGuest] = useState(false)
    const [tableMissing, setTableMissing] = useState(false)
    const [sheet, setSheet] = useState(false)
    const [editBot, setEditBot] = useState<TeamBot | null>(null)
    const [groupSheet, setGroupSheet] = useState(false)
    const [channels, setChannels] = useState<ChannelView[]>([])
    const [query, setQuery] = useState('')
    const [demo, setDemo] = useState(false)   // 시연(?demo=1). 서버와 첫 그림이 같아야 해서 효과에서 한 박자 뒤에 읽는다
    const [phone, setPhone] = useState(false) // 좁은 화면(≤900px). 사용 한도 원형과 ＋ 단추가 명단 띠 끝으로 옮겨 간다
    const [menu, setMenu] = useState<CtxMenu | null>(null)
    const bootstrapped = useRef(false)   // 기본 봇 만들기는 한 세션에 한 번만
    const pressTimer = useRef<number | null>(null)
    const pressStart = useRef<{ x: number; y: number } | null>(null)
    const suppressClick = useRef(false)  // 길게 눌러 메뉴를 열었으면 손을 뗄 때 나는 클릭(이동)을 막는다

    const refresh = useCallback(async () => {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1') {
            setTeam(DEMO_TEAM); setGuest(false); setTableMissing(false); setLoading(false)
            return
        }
        try {
            const res = await fetch('/api/os/team', { cache: 'no-store' })
            const data = await res.json()
            const isGuest = !!data.guest
            // 손님(로그인 전)은 팀이 없어서 늘 team=[] 이 온다 — 시연 팀 4명을 기본으로 보여준다(대표 지시 0923 「비회원도 격자, 시연 대화」)
            setTeam(isGuest ? DEMO_TEAM : (Array.isArray(data.team) ? data.team : []))
            setGuest(isGuest)
            setTableMissing(!!data.tableMissing)
        } catch {
            setTeam([])
        } finally {
            setLoading(false)
        }
    }, [])

    // 그룹방 목록. 표가 아직 없으면 조용히 빈 목록으로 둔다(화면이 죽지 않게)
    const refreshChannels = useCallback(async () => {
        try {
            const res = await fetch('/api/os/channels', { cache: 'no-store' })
            const data = await res.json()
            setChannels(Array.isArray(data.channels) ? data.channels : [])
        } catch {
            setChannels([])
        }
    }, [])

    useEffect(() => { void refresh() }, [refresh])
    useEffect(() => { void refreshChannels() }, [refreshChannels])

    // 이 화면에 왔다(획득) + 설정에서 고른 글자 크기를 되살린다 + 시연인지, 폰인지 읽는다
    useEffect(() => {
        osTrack('os_view')
        applyFontSize(document.documentElement, readFontSize(window.localStorage))
        void Promise.resolve().then(() => setDemo(new URLSearchParams(window.location.search).get('demo') === '1'))
        const mq = window.matchMedia?.('(max-width: 900px)')
        if (!mq) return
        const apply = () => setPhone(mq.matches)
        void Promise.resolve().then(apply)
        mq.addEventListener('change', apply)
        return () => mq.removeEventListener('change', apply)
    }, [])

    // 설정, 봇 마켓 같은 한 장 화면에서 「대화로 돌아가기」. 앱으로 설치해 열면 브라우저 뒤로 단추가 없어서 이 단추가 유일한 길이다
    const goBack = useCallback(() => {
        if (window.history.length > 1) router.back()
        else router.push(`/os${demo ? '?demo=1' : ''}`)
    }, [router, demo])

    /**
     * 첫 로그인인데 팀이 비어 있으면 기본 봇을 한 번만 만들어 준다(서버가 개수를 정한다 = DEFAULT_TEAM).
     * 빈 화면에서 「＋ 를 눌러 첫 봇을 만드세요」는 대부분 그냥 나간다(대표 지시 0923).
     * 실패는 조용히 넘긴다. 만들기 단추는 그대로 있으니 사람이 직접 만들 수 있다.
     */
    useEffect(() => {
        if (loading || guest || tableMissing || team.length > 0 || bootstrapped.current) return
        bootstrapped.current = true
        void (async () => {
            try {
                const res = await fetch('/api/os/team/bootstrap', { method: 'POST' })
                const d = await res.json().catch(() => ({}))
                if (res.ok && Array.isArray(d.team) && d.team.length > 0) await refresh()
            } catch { /* 조용히 */ }
        })()
    }, [loading, guest, tableMissing, team.length, refresh])

    // /os?new=1 (앱 아이콘 길게 눌러 「새 봇」) = 만들기 창을 바로 연다. 옛 ⌘N 과 오른쪽 위 ＋ 는 격자 아래 「＋ 개인봇」이 대신한다
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('new') === '1') setSheet(true)
    }, [])

    const visible = useMemo(() => {
        const q = query.trim()
        return team
            .filter(b => !b.hidden)
            .filter(b => !q || b.name.includes(q) || (b.oneLiner ?? '').includes(q))
    }, [team, query])

    const value = useMemo<TeamState>(() => ({
        team, loading, guest, tableMissing, refresh, openNewBot: () => setSheet(true),
        channels, refreshChannels, openNewGroup: () => setGroupSheet(true),
    }), [team, loading, guest, tableMissing, refresh, channels, refreshChannels])

    // ── 우클릭 / 길게 누르기 메뉴 ──────────────────────────────
    const openMenu = useCallback((bot: TeamBot, x: number, y: number) => {
        if (guest || demo) return   // 손님, 시연 봇은 바꿀 수 없다
        const w = typeof window !== 'undefined' ? window.innerWidth : 0
        const h = typeof window !== 'undefined' ? window.innerHeight : 0
        setMenu({ bot, x: Math.max(8, Math.min(x, w - 210)), y: Math.max(8, Math.min(y, h - 240)) })
    }, [guest, demo])

    const clearPress = useCallback(() => {
        if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null }
        pressStart.current = null
    }, [])
    const startPress = useCallback((e: React.PointerEvent, bot: TeamBot) => {
        if (e.pointerType === 'mouse') return   // 마우스는 오른쪽 단추(onContextMenu)로
        clearPress()
        pressStart.current = { x: e.clientX, y: e.clientY }
        const { clientX, clientY } = e
        pressTimer.current = window.setTimeout(() => {
            pressTimer.current = null
            suppressClick.current = true
            openMenu(bot, clientX, clientY)
        }, LONG_PRESS_MS)
    }, [clearPress, openMenu])
    const movePress = useCallback((e: React.PointerEvent) => {
        const s = pressStart.current
        if (!s) return
        if (Math.abs(e.clientX - s.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - s.y) > MOVE_CANCEL_PX) clearPress()
    }, [clearPress])

    useEffect(() => {
        if (!menu) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
        window.addEventListener('keydown', onKey)
        window.addEventListener('scroll', () => setMenu(null), { once: true, capture: true })
        return () => window.removeEventListener('keydown', onKey)
    }, [menu])

    const chatPath = useCallback((b: TeamBot) => `/os/chat/${b.mentorId}`, [])
    const isCurrent = useCallback((b: TeamBot) => pathname === chatPath(b), [pathname, chatPath])

    const 대화새로시작 = (b: TeamBot) => {
        setMenu(null)
        // 같은 봇, 새 열쇠(new=시각) → 대화 화면이 빈 대화로 다시 그려진다(chat/[botId]/page.tsx 가 key 로 쓴다)
        router.push(`${chatPath(b)}?new=${Date.now()}${demo ? '&demo=1' : ''}`)
    }
    const 숨기기 = async (b: TeamBot) => {
        setMenu(null)
        try {
            await fetch(`/api/os/team/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hidden: true }) })
            await refresh()
            if (isCurrent(b)) router.push('/os')   // 숨긴 봇 화면에 남지 않게 첫 봇으로
        } catch { /* 명단이 안 바뀌면 그대로 */ }
    }
    const 팀에서빼기 = async (b: TeamBot) => {
        setMenu(null)
        if (!window.confirm(`「${b.name}」을(를) 정말 빼시겠어요?\n봇의 몸과 대화 기록은 남아요. 팀 명단에서만 빠져요.`)) return
        try {
            await fetch(`/api/os/team/${b.id}`, { method: 'DELETE' })
            await refresh()
            if (isCurrent(b)) router.push('/os')
        } catch { /* 명단이 안 바뀌면 그대로 */ }
    }

    // 손님 소개 화면(/os/welcome)은 한 장짜리라 뼈대(왼쪽 명단) 없이 그린다
    if (pathname.startsWith('/os/welcome')) return <>{children}</>

    const 한장화면 = pathname.startsWith('/os/settings') || pathname.startsWith('/os/market')
    const q = demo ? '?demo=1' : ''

    const addButtons = (
        <>
            <button type="button" className="os-add-btn" onClick={() => setSheet(true)} title="새 봇 만들기">＋ 개인봇</button>
            <button type="button" className="os-add-btn" onClick={() => setGroupSheet(true)} title="봇 여러 명과 한 방">＋ 단체방</button>
        </>
    )

    return (
        <Ctx.Provider value={value}>
            <div className="os-shell" data-theme="os">
                <aside className="os-left" style={{ position: 'relative' }}>
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
                            // Link + prefetch = 화면에 보이는 순간 그 봇 화면을 미리 받아 둔다 → 누르면 서버를 안 기다린다 (대표 지시 0923 「전환이 느려」)
                            // 주소를 쌓는(push) 보통 링크라 봇 A → 봇 B → 뒤로 = A 가 된다
                            const current = isCurrent(b)
                            return (
                                <Link
                                    key={b.id}
                                    href={`${chatPath(b)}${q}`}
                                    prefetch={true}
                                    role="listitem"
                                    className="os-bot-tile"
                                    aria-current={current}
                                    title={b.oneLiner ?? b.name}
                                    onContextMenu={e => { e.preventDefault(); openMenu(b, e.clientX, e.clientY) }}
                                    onPointerDown={e => startPress(e, b)}
                                    onPointerMove={movePress}
                                    onPointerUp={clearPress}
                                    onPointerCancel={clearPress}
                                    onPointerLeave={clearPress}
                                    onClick={e => { if (suppressClick.current) { e.preventDefault(); suppressClick.current = false } }}
                                >
                                    {/* 폰 띠는 96px 안에 캐릭터+이름이 들어가야 해서 52px (넓은 화면 격자는 72px 그대로) */}
                                    <BotAvatar shape={b.shape} color={b.color} state={current ? 'listening' : 'idle'} size={phone ? 52 : 72} faceUrl={b.avatarUrl} name={b.name} />
                                    <span className="os-bot-name">{b.name}</span>
                                    {b.oneLiner && <span className="os-chip">{b.oneLiner}</span>}
                                </Link>
                            )
                        })}
                        {!loading && visible.length === 0 && !guest && (
                            <div style={{ gridColumn: '1 / -1', color: 'var(--os-글-흐림)', fontSize: 14, padding: '20px 8px', textAlign: 'center', lineHeight: 1.6 }}>
                                아직 팀이 없어요.<br />아래 「＋ 개인봇」으로 첫 봇을 만들어요.
                            </div>
                        )}
                        {!loading && guest && (
                            <div style={{ gridColumn: '1 / -1', color: 'var(--os-글-흐림)', fontSize: 14, padding: '20px 8px', textAlign: 'center', lineHeight: 1.6 }}>
                                지금은 둘러보기예요. 자료 올리기, 루틴, 편집은 로그인하면 할 수 있어요.
                            </div>
                        )}
                        {!loading && guest && <GuestRoster />}
                        {/* 폰 = 명단이 가로 띠라 ＋ 단추 2개와 사용 한도 원형을 띠 끝에 둔다 */}
                        {phone && <div className="os-add-tile" role="listitem">{addButtons}</div>}
                        {phone && !guest && !demo && <div className="os-usage-tile" role="listitem"><UsageBar guest={guest} /></div>}
                    </div>

                    {/* 격자 아래 가로 단추 2개 (넓은 화면). 옛 오른쪽 위 ＋ 타일과 ⌘N 을 이 둘로 갈음 */}
                    {!phone && <div className="os-add-row">{addButtons}</div>}

                    {/* 그룹 채팅 = 겹친 아바타 + 이름. 표가 없으면 이 칸 자체가 안 보인다 */}
                    {channels.length > 0 && (
                        <div className="os-groups">
                            {channels.map(c => {
                                const href = `/os/group/${c.id}`
                                return (
                                    <Link key={c.id} href={href} prefetch={true} className="os-row-btn" aria-current={pathname === href} style={{ textDecoration: 'none' }}>
                                        <span className="os-stack" aria-hidden>
                                            {c.members.slice(0, 3).map(m => (
                                                <span key={m.mentorId} className="os-stack-item">
                                                    <BotAvatar shape={m.shape as TeamBot['shape']} color={m.color as TeamBot['color']} state="idle" size={24} />
                                                </span>
                                            ))}
                                            {c.members.length > 3 && <span className="os-stack-more">+{c.members.length - 3}</span>}
                                        </span>
                                        <span>{c.name}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    )}

                    <InstallPrompt />
                    <div className="os-left-bottom">
                        {/* 사용 한도 원형 = 「봇 마켓」 줄 바로 위 (대표 지시 0923). 누르면 사용량 모달 */}
                        {!phone && !demo && <div className="os-usage-slot"><UsageBar guest={guest} /></div>}
                        {/* 봇 마켓은 뼈대 안(/os/market)에서 그린다 = 왼쪽 명단이 남아 있어 뒤로도, 봇 타일로도 대화로 돌아온다 */}
                        <Link href={`/os/market${q}`} className="os-row-btn" aria-current={pathname.startsWith('/os/market')} style={{ textDecoration: 'none' }}><IconStore /> <span>봇 마켓</span></Link>
                        <Link href="/os/connect" className="os-row-btn" aria-current={pathname.startsWith('/os/connect')} style={{ textDecoration: 'none' }}><IconPlug /> <span>연결</span></Link>
                        <Link href="/os/settings" className="os-row-btn" aria-current={pathname.startsWith('/os/settings')} style={{ textDecoration: 'none' }}><IconGear /> <span>설정</span></Link>
                        {guest
                            ? <Link href="/login?next=/os" className="os-row-btn" style={{ textDecoration: 'none' }}><IconLogin /> <span>로그인</span></Link>
                            : <Link href="/profile" className="os-row-btn" style={{ textDecoration: 'none' }}><IconUser /> <span>내 계정</span></Link>}
                    </div>
                </aside>

                <section className="os-main">
                    {한장화면 && (
                        <button type="button" className="os-back" onClick={goBack}><IconBack /> <span>대화로 돌아가기</span></button>
                    )}
                    {children}
                </section>

                {menu && (
                    <>
                        <div className="os-ctx-back" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} />
                        <div className="os-ctx" role="menu" aria-label={`${menu.bot.name} 메뉴`} style={{ left: menu.x, top: menu.y }}>
                            <div className="os-ctx-title">{menu.bot.name}</div>
                            <button type="button" role="menuitem" className="os-ctx-item" onClick={() => { setMenu(null); setEditBot(menu.bot) }}>편집</button>
                            <button type="button" role="menuitem" className="os-ctx-item" onClick={() => 대화새로시작(menu.bot)}>대화 새로 시작</button>
                            <button type="button" role="menuitem" className="os-ctx-item" onClick={() => void 숨기기(menu.bot)}>숨기기</button>
                            <button type="button" role="menuitem" className="os-ctx-item danger" onClick={() => void 팀에서빼기(menu.bot)}>팀에서 빼기</button>
                        </div>
                    </>
                )}

                {sheet && (
                    <NewBotSheet
                        guest={guest}
                        onClose={() => setSheet(false)}
                        onCreated={async (bot) => { setSheet(false); await refresh(); router.push(`/os/chat/${bot.mentorId}`) }}
                        onWantGroup={() => { setSheet(false); setGroupSheet(true) }}
                    />
                )}

                {editBot && (
                    <NewBotSheet
                        guest={guest}
                        edit={editBot}
                        onClose={() => setEditBot(null)}
                        onCreated={() => { /* 편집 모드엔 안 쓴다 */ }}
                        onSaved={refresh}
                    />
                )}

                {groupSheet && (
                    <NewGroupSheet
                        team={team}
                        onClose={() => setGroupSheet(false)}
                        onCreated={async (ch) => { setGroupSheet(false); await refreshChannels(); router.push(`/os/group/${ch.id}`) }}
                    />
                )}
            </div>
        </Ctx.Provider>
    )
}
