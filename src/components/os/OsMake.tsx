'use client'
// OS 안 「내 AI 만들기」 (/os/make). 대표 확정 10/3 12:32 「OS UI에 다 옮겨놔. SNS 주소 입력하는 것도」.
// 문구·주소 판별·칩·보관은 /home(HomeMake)과 같은 것을 그대로 쓴다(HOME_COPY, link-guide, link-chip, draft-store).
// 다른 점 = 고치기 단계 없이 바로 만든다.
//   로그인한 사람: POST /api/os/twin-draft → POST /api/os/twin-draft/create → 명단 새로 읽기 → 그 봇 대화방(봇 인사말이 첫 말풍선)
//   손님: 넣은 것을 브라우저에 보관하고 로그인(카카오 먼저) → 이 화면으로 돌아와 이어 만든다
//   초안이 저장 기준에 못 미치면 옛 고치기 창(「＋ 개인봇」의 내 링크로 만들기)으로 넘긴다
// 새 API 는 없다.

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { HOME_COPY } from '@/domains/home/copy'
import { BARE_ID_PLACES, homeLinkGuide } from '@/domains/home/link-guide'
import { HOME_TAB_OF, homeLinkFallbackTitle, homeLinkPlatform, looksLikeLink, splitLinks } from '@/domains/home/link-chip'
import { clearHomeDraft, readHomeDraft, saveHomeDraft } from '@/domains/home/draft-store'
import { TWIN_DRAFT_CONSENTS, TWIN_DRAFT_MAX_LINKS, draftSourceKind, draftStepAt, type TwinDraft } from '@/domains/os/twin-draft-shared'
import { osTrack } from '@/domains/os/events'
import type { TeamBot } from '@/domains/os/types'
import { HomeCloseIcon, HomeSourceIcon, type HomeIconKind } from '@/components/home/HomeIcons'
import { useOsTeam } from './OsShell'
import './make.css'

const PASTE_MIN = 30
const longEnough = (t: string) => t.replace(/\s+/g, '').length >= PASTE_MIN
const TAB_ICON: Record<string, HomeIconKind> = { instagram: 'instagram', blog: 'blog', youtube: 'youtube', threads: 'threads', shop: 'shop', file: 'file' }
/** 손님이 로그인한 뒤 돌아올 곳 */
export const OS_MAKE_PATH = '/os/make'

function learnedKinds(d: TwinDraft): string[] {
    const counts: Record<string, number> = { ...(d.counts ?? {}) }
    if (!d.counts) for (const s of d.sources) { const k = s.kind ?? draftSourceKind(s.url); counts[k] = (counts[k] ?? 0) + 1 }
    return Object.entries(counts).filter(([, n]) => (n ?? 0) > 0).map(([k]) => k)
}

type Phase = 'idle' | 'working' | 'error'

export default function OsMake() {
    const c = HOME_COPY
    const router = useRouter()
    const { guest, loading, refresh, openNewBot, openNav } = useOsTeam()
    const [text, setText] = useState('')
    const [links, setLinks] = useState<string[]>([])
    const [titles, setTitles] = useState<Record<string, string>>({})
    const [source, setSource] = useState<string | null>(c.chips[0]?.id ?? null)
    const [tried, setTried] = useState(false)
    const [direct, setDirect] = useState(false)
    const [desc, setDesc] = useState('')
    const [placeholder, setPlaceholder] = useState<string>(c.multi)
    const [fileNote, setFileNote] = useState(false)
    const [phase, setPhase] = useState<Phase>('idle')
    const [stepText, setStepText] = useState(() => draftStepAt(0))
    const [err, setErr] = useState<string | null>(null)
    const [working, setWorking] = useState<string[]>([])
    const input = useRef<HTMLInputElement>(null)
    const asked = useRef(new Set<string>())
    const resumed = useRef(false)

    // 기다리는 동안 단계 문구를 시간에 따라 바꾼다 (옛 만들기 창과 같은 문구)
    useEffect(() => {
        if (phase !== 'working') return
        const t0 = Date.now()
        setStepText(draftStepAt(0))
        const id = setInterval(() => setStepText(draftStepAt(Date.now() - t0)), 1_000)
        return () => clearInterval(id)
    }, [phase])

    const askTitle = (url: string) => {
        if (asked.current.has(url)) return
        asked.current.add(url)
        fetch(`/api/home/link-title?url=${encodeURIComponent(url)}`)
            .then(r => (r.ok ? r.json() : null))
            .then((j: { title?: string | null } | null) => { if (j?.title) setTitles(t => ({ ...t, [url]: j.title as string })) })
            .catch(() => {})
    }

    const addUrls = (raws: string[]): boolean => {
        const got = raws.map(r => homeLinkGuide(r).url).filter((u): u is string => !!u)
        if (!got.length) return false
        setLinks(ls => {
            const next = [...ls]
            for (const u of got) if (!next.includes(u) && next.length < TWIN_DRAFT_MAX_LINKS) next.push(u)
            return next
        })
        got.forEach(askTitle)
        const tab = HOME_TAB_OF[homeLinkPlatform(got[got.length - 1])]
        if (tab) setSource(tab)
        setPlaceholder(c.multi); setFileNote(false); setTried(false)
        return true
    }

    /** 로그인한 사람: 읽고 → 바로 저장 → 대화방. 실패하면 이유를 보여 주고, 저장 기준 미달이면 고치기 창으로 */
    const build = useCallback(async (all: string[], pastes: string[]) => {
        const consents = TWIN_DRAFT_CONSENTS.map(() => true)   // 동의 체크 없앰 (대표 지시 0929, /home 과 같다)
        setPhase('working'); setErr(null); setWorking(all)
        osTrack('os_make_started', { links: all.length, pastes: pastes.length })
        try {
            const r1 = await fetch('/api/os/twin-draft', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ links: all, pastes, consents }),
            })
            const d1 = await r1.json().catch(() => ({}))
            if (!r1.ok) { setErr(d1.error || '초안을 만들지 못했어요'); setPhase('error'); return }
            const draft = d1.draft as TwinDraft
            const name = (draft.name || '').trim().slice(0, 20)
            if (!name || (draft.prompt || '').trim().length < 20) {
                // 저장 기준에 못 미침 = 옛 고치기 창에서 사람이 채운다 (같은 보관분을 읽는다)
                saveHomeDraft(window.localStorage, { links: all, pastes, consents })
                setPhase('idle'); setWorking([])
                openNewBot('link')
                return
            }
            const r2 = await fetch('/api/os/twin-draft/create', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, oneLiner: draft.oneLiner, greeting: draft.greeting, prompt: draft.prompt, chips: draft.chips,
                    shape: 'circle', color: 'orange', learned: learnedKinds(draft), links: all, pastes,
                }),
            })
            const d2 = await r2.json().catch(() => ({}))
            if (!r2.ok) { setErr(d2.error || '만들지 못했어요'); setPhase('error'); return }
            const bot = d2.bot as TeamBot
            osTrack('os_bot_created', { job: 'twin_draft', autonomy: 'always_ask', shape: 'circle', color: 'orange' })
            await refresh()
            router.push(`/os/chat/${bot.mentorId}`)
        } catch {
            setErr('연결이 잠깐 끊겼어요. 다시 눌러 주세요'); setPhase('error')
        }
    }, [openNewBot, refresh, router])

    const go = (all: string[], pastes: string[]) => {
        if (all.length === 0 && pastes.length === 0) { input.current?.focus(); return }
        if (phase === 'working') return
        if (guest) {
            // 손님: 저장 직전까지는 로그인 없이. 저장할 때 카카오(로그인 화면)로 갔다가 여기로 돌아와 이어 만든다
            saveHomeDraft(window.localStorage, { links: all, pastes, consents: TWIN_DRAFT_CONSENTS.map(() => true) })
            window.location.assign(`/login?next=${encodeURIComponent(OS_MAKE_PATH)}&provider=kakao`)
            return
        }
        void build(all, pastes)
    }

    // 로그인하고 돌아온 손님(또는 /home 에서 넣고 온 분): 보관분으로 한 번만 이어 만든다
    useEffect(() => {
        if (loading || guest || resumed.current) return
        resumed.current = true
        const d = readHomeDraft(typeof window === 'undefined' ? null : window.localStorage)
        if (!d) return
        clearHomeDraft(window.localStorage)
        setLinks(d.links)
        void build(d.links, d.pastes)
    }, [loading, guest, build])

    const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const { links: found, rest } = splitLinks(e.clipboardData.getData('text'))
        if (!found.length) return
        e.preventDefault()
        addUrls(found)
        setText(t => [t.trim(), rest].filter(Boolean).join(' '))
    }
    const onType = (v: string) => {
        if (/[\s,]$/.test(v)) {
            const { links: found, rest } = splitLinks(v)
            if (found.length) { addUrls(found); setText(rest ? `${rest} ` : ''); return }
        }
        setText(v); setTried(false)
    }
    const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !text && links.length) setLinks(ls => ls.slice(0, -1))
    }

    const submit = () => {
        const t = text.trim()
        let extra: string[] = []
        if (t) {
            const { links: found } = splitLinks(t)
            const cand = found.length ? found : looksLikeLink(t) ? [t] : []
            if (!cand.length) { setTried(true); return }
            addUrls(cand); setText(''); extra = cand
        }
        const all = [...new Set([...links, ...extra])].slice(0, TWIN_DRAFT_MAX_LINKS)
        const pastes = [direct ? desc : ''].filter(longEnough)
        go(all, pastes)
    }

    const guide = text.trim() ? homeLinkGuide(text) : null
    const busy = phase === 'working'

    return (
        <div className="os-make">
            {/* 좁은 화면: 명단(봇 목록) 서랍을 여는 단추. 대화방 머리와 같은 자리 */}
            <div className="os-make-top">
                <button type="button" className="os-head-btn os-make-roster" aria-label="봇 명단 열기" aria-controls="os-nav" onClick={openNav}>명단</button>
            </div>

            <section className="os-make-hero" aria-labelledby="os-make-title">
                <h1 id="os-make-title" className="os-make-title">{c.title}</h1>
                <p className="os-make-sub">{c.sub}</p>

                {busy ? (
                    <div className="os-make-progress" role="status" aria-live="polite">
                        <div className="os-make-dots" aria-hidden><span /><span /><span /></div>
                        <strong>{stepText}</strong>
                        <ul className="os-make-reading">
                            {working.map(u => <li key={u}><HomeSourceIcon kind={homeLinkPlatform(u)} size={18} /><span>{titles[u] ?? homeLinkFallbackTitle(u)}</span></li>)}
                        </ul>
                    </div>
                ) : (
                    <>
                        <div className="os-make-chips" role="group" aria-label="넣을 곳 고르기">
                            {c.chips.map(ch => (
                                <button
                                    key={ch.id} type="button" className="os-make-chip" aria-pressed={source === ch.id}
                                    onClick={() => {
                                        setSource(ch.id)
                                        if (ch.id === 'file') { setFileNote(true); return }
                                        setFileNote(false); setPlaceholder(ch.example); input.current?.focus()
                                    }}
                                >
                                    <HomeSourceIcon kind={TAB_ICON[ch.id] ?? 'web'} size={18} />
                                    <span>{ch.label}</span>
                                </button>
                            ))}
                        </div>

                        <form className="os-make-row" onSubmit={e => { e.preventDefault(); submit() }}>
                            <div className="os-make-field" onClick={() => input.current?.focus()}>
                                {links.length === 0 && <span className="os-make-ico"><HomeSourceIcon kind="link" size={20} /></span>}
                                {links.map(url => {
                                    const title = titles[url] ?? homeLinkFallbackTitle(url)
                                    return (
                                        <span key={url} className="os-make-pill" title={url}>
                                            <HomeSourceIcon kind={homeLinkPlatform(url)} size={18} />
                                            <span className="os-make-pill-t">{title}</span>
                                            <button type="button" className="os-make-pill-x" aria-label={`${title} ${c.remove}`} onClick={e => { e.stopPropagation(); setLinks(ls => ls.filter(x => x !== url)) }}>
                                                <HomeCloseIcon />
                                            </button>
                                        </span>
                                    )
                                })}
                                {links.length < TWIN_DRAFT_MAX_LINKS && (
                                    <input
                                        id="os-make-input" ref={input} className="os-make-input" value={text}
                                        onChange={e => onType(e.target.value)} onPaste={onPaste} onKeyDown={onKey}
                                        placeholder={links.length ? c.multi : placeholder} aria-label={c.placeholder}
                                        autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url"
                                    />
                                )}
                            </div>
                            <button type="submit" className="os-btn primary os-make-btn">{c.make}</button>
                        </form>

                        {guide?.kind === 'bareId' && (
                            <>
                                <p className="os-make-guide" aria-live="polite">{guide.line}</p>
                                <div className="os-make-chips" role="group" aria-label={guide.line}>
                                    {BARE_ID_PLACES.map(p => (
                                        <button key={p.id} type="button" className="os-make-chip" onClick={() => { if (addUrls([p.url(text.trim().replace(/^@/, ''))])) setText('') }}>
                                            <HomeSourceIcon kind={homeLinkPlatform(p.url('a'))} size={18} />
                                            <span>{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        {tried && guide?.kind === 'bad' && <p className="os-make-guide bad" aria-live="polite">{guide.line}</p>}
                        {fileNote && <p className="os-make-guide">{c.fileNote}</p>}
                        {(source === 'instagram' || source === 'threads') && !fileNote && (
                            <div className="os-make-guide" aria-live="polite">
                                <strong>{c.snsGuideTitle}</strong>
                                <ol>{c.snsGuide.map(t => <li key={t}>{t}</li>)}</ol>
                            </div>
                        )}
                        {err && <div className="os-notice os-make-err" role="alert">{err}</div>}

                        <p className="os-make-safe">{c.safe}</p>
                        {!direct ? (
                            <button type="button" className="os-make-link" onClick={() => setDirect(true)}>{c.direct}</button>
                        ) : (
                            <div className="os-make-direct">
                                <label>
                                    <span className="os-field-label">{c.directLabel}</span>
                                    <textarea className="os-textarea" rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder={c.directPlaceholder} autoFocus />
                                </label>
                                {desc.trim() && !longEnough(desc) && <span className="os-make-hint">{c.directShort}</span>}
                            </div>
                        )}
                        {guest && <p className="os-make-hint">{c.draftNote}</p>}
                        {!guest && <button type="button" className="os-make-link quiet" onClick={() => openNewBot()}>주소 없이 할 일을 골라 만들기</button>}
                    </>
                )}
            </section>
        </div>
    )
}
