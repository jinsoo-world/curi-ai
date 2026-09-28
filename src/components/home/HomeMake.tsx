'use client'
// /home 맨 위 입력칸 (대표 지시 0929 01:09): 곳 고르기는 아이콘 알약 칸(고른 칸은 진하게), 주소를 붙이면 둥근 칩(곳 아이콘, 제목 한 줄, 빼기)으로 바뀐다.
// 여러 주소를 넣을 수 있고 입력칸은 계속 남는다. 못 읽는다는 말은 하지 않는다 (모든 주소를 받는다).
// 「초안 만들기」를 누르면 넣은 것을 브라우저에 보관하고, 로그인한 사람은 /os 로, 아닌 사람은 가입(로그인)으로 보낸다.
// 가입 직후 /os 가 보관분을 읽어 「내 링크로 만들기」 초안을 이어 만든다.

import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HOME_COPY } from '@/domains/home/copy'
import { BARE_ID_PLACES, homeLinkGuide } from '@/domains/home/link-guide'
import { HOME_TAB_OF, homeLinkFallbackTitle, homeLinkPlatform, looksLikeLink, splitLinks } from '@/domains/home/link-chip'
import { HOME_DRAFT_NEXT, saveHomeDraft } from '@/domains/home/draft-store'
import { TWIN_DRAFT_CONSENTS, TWIN_DRAFT_MAX_LINKS } from '@/domains/os/twin-draft-shared'
import { HomeCloseIcon, HomeSourceIcon, type HomeIconKind } from '@/components/home/HomeIcons'

const PASTE_MIN = 30
const longEnough = (t: string) => t.replace(/\s+/g, '').length >= PASTE_MIN
const TAB_ICON: Record<string, HomeIconKind> = { instagram: 'instagram', blog: 'blog', youtube: 'youtube', threads: 'threads', shop: 'shop', file: 'file' }

export default function HomeMake() {
    const c = HOME_COPY
    const [text, setText] = useState('')
    const [links, setLinks] = useState<string[]>([])
    const [titles, setTitles] = useState<Record<string, string>>({})
    const [source, setSource] = useState<string | null>(c.chips[0]?.id ?? null) // 탈잉처럼 첫 칸이 켜진 채로
    const [tried, setTried] = useState(false)
    const [direct, setDirect] = useState(false)
    const [desc, setDesc] = useState('')
    const [descUrl, setDescUrl] = useState('')
    const [agree, setAgree] = useState<boolean[]>(() => TWIN_DRAFT_CONSENTS.map(() => false))
    const [placeholder, setPlaceholder] = useState<string>(c.multi)
    const [fileNote, setFileNote] = useState(false)
    const [panel, setPanel] = useState(false)
    const [signedIn, setSignedIn] = useState(false)
    const [going, setGoing] = useState(false)
    const input = useRef<HTMLInputElement>(null)
    const descBox = useRef<HTMLTextAreaElement>(null)
    const asked = useRef(new Set<string>())

    useEffect(() => {
        createClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session)).catch(() => {})
        if (window.location.hash === '#make') input.current?.focus()
        // 「무엇을 맡길 수 있나요」 카드 → 직접 설명해서 만들기
        const onDirect = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail
            setDirect(true); setPanel(true)
            if (detail) setDesc(d => d.trim() ? d : `${detail}. `)
            document.getElementById('make')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            window.setTimeout(() => descBox.current?.focus({ preventScroll: true }), 350)
        }
        window.addEventListener('curi-home-direct', onDirect)
        return () => window.removeEventListener('curi-home-direct', onDirect)
    }, [])

    // 제목 받아 오기 (못 받으면 주소로 만든 이름 그대로)
    const askTitle = (url: string) => {
        if (asked.current.has(url)) return
        asked.current.add(url)
        fetch(`/api/home/link-title?url=${encodeURIComponent(url)}`)
            .then(r => (r.ok ? r.json() : null))
            .then((j: { title?: string | null } | null) => { if (j?.title) setTitles(t => ({ ...t, [url]: j.title as string })) })
            .catch(() => {})
    }

    /** 주소들을 칩으로. 하나라도 넣었으면 true */
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
        setPlaceholder(c.multi); setFileNote(false); setTried(false); setPanel(true)
        return true
    }

    const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
        const { links: found, rest } = splitLinks(e.clipboardData.getData('text'))
        if (!found.length) return
        e.preventDefault()
        addUrls(found)
        setText(t => [t.trim(), rest].filter(Boolean).join(' '))
    }

    const onType = (v: string) => {
        // 띄어쓰기나 쉼표를 치면 앞의 주소를 칩으로
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
        if (!t) { if (links.length) setPanel(true); else input.current?.focus(); return }
        const { links: found } = splitLinks(t)
        if (found.length && addUrls(found)) { setText(''); return }
        if (looksLikeLink(t) && addUrls([t])) { setText(''); return }
        setTried(true)
    }

    const guide = text.trim() ? homeLinkGuide(text) : null
    const descGuide = descUrl.trim() ? homeLinkGuide(descUrl) : null
    const pastes = [direct ? desc : ''].filter(longEnough)
    const draftLinks = [...links, ...(direct && descGuide?.url ? [descGuide.url] : [])].slice(0, TWIN_DRAFT_MAX_LINKS)
    const canDraft = agree.every(Boolean) && (draftLinks.length > 0 || pastes.length > 0) && !going

    const makeDraft = () => {
        if (!canDraft) return
        setGoing(true)
        saveHomeDraft(window.localStorage, { links: draftLinks, pastes, consents: agree })
        window.location.href = signedIn ? HOME_DRAFT_NEXT : `/login?next=${encodeURIComponent(HOME_DRAFT_NEXT)}`
    }

    return (
        <section id="make" className="hm-make" aria-labelledby="hm-title">
            <h1 id="hm-title" className="hm-title">{c.title}</h1>
            <p className="hm-sub">{c.sub}</p>

            <div className="hm-tabs" role="group" aria-label="넣을 곳 고르기">
                {c.chips.map(ch => (
                    <button
                        key={ch.id} type="button" className={`hm-tab ${source === ch.id ? 'on' : ''}`} aria-pressed={source === ch.id}
                        onClick={() => {
                            setSource(ch.id)
                            if (ch.id === 'file') { setFileNote(true); return }
                            setFileNote(false); setPlaceholder(ch.example); input.current?.focus()
                        }}
                    >
                        <HomeSourceIcon kind={TAB_ICON[ch.id] ?? 'web'} size={20} />
                        <span>{ch.label}</span>
                    </button>
                ))}
            </div>

            <form className="hm-inputrow" onSubmit={e => { e.preventDefault(); submit() }}>
                <div className="hm-field" onClick={() => input.current?.focus()}>
                    {links.length === 0 && <span className="hm-field-ico"><HomeSourceIcon kind="link" size={20} /></span>}
                    {links.map(url => {
                        const title = titles[url] ?? homeLinkFallbackTitle(url)
                        return (
                            <span key={url} className="hm-pill" title={url}>
                                <HomeSourceIcon kind={homeLinkPlatform(url)} size={18} />
                                <span className="hm-pill-t">{title}</span>
                                <button type="button" className="hm-pill-x" aria-label={`${title} ${c.remove}`} onClick={e => { e.stopPropagation(); setLinks(ls => ls.filter(x => x !== url)) }}>
                                    <HomeCloseIcon />
                                </button>
                            </span>
                        )
                    })}
                    {links.length < TWIN_DRAFT_MAX_LINKS && (
                        <input
                            id="hm-input" ref={input} className="hm-input" value={text}
                            onChange={e => onType(e.target.value)} onPaste={onPaste} onKeyDown={onKey}
                            placeholder={links.length ? c.multi : placeholder} aria-label={c.placeholder}
                            autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url"
                        />
                    )}
                </div>
                <button type="submit" className="hm-btn">{c.make}</button>
            </form>

            {guide?.kind === 'bareId' && (
                <>
                    <p className="hm-guide" aria-live="polite">{guide.line}</p>
                    <div className="hm-tabs small" role="group" aria-label={guide.line}>
                        {BARE_ID_PLACES.map(p => (
                            <button key={p.id} type="button" className="hm-tab" onClick={() => { if (addUrls([p.url(text.trim().replace(/^@/, ''))])) setText('') }}>
                                <HomeSourceIcon kind={homeLinkPlatform(p.url('a'))} size={18} />
                                <span>{p.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
            {tried && guide?.kind === 'bad' && <p className="hm-guide bad" aria-live="polite">{guide.line}</p>}
            {fileNote && <p className="hm-guide">{c.fileNote}</p>}

            <p className="hm-safe">{c.safe}</p>
            <button type="button" className="hm-direct" onClick={() => { setDirect(true); setPanel(true); window.setTimeout(() => descBox.current?.focus(), 50) }}>{c.direct}</button>

            {panel && (
                <div className="hm-panel">
                    {direct && (
                        <div className="hm-block">
                            <label>
                                <span className="hm-label">{c.directLabel}</span>
                                <textarea ref={descBox} className="hm-text" rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder={c.directPlaceholder} />
                            </label>
                            {desc.trim() && !longEnough(desc) && <span className="hm-hint">{c.directShort}</span>}
                            <label>
                                <span className="hm-label">{c.directUrl}</span>
                                <input className="hm-input small" value={descUrl} onChange={e => setDescUrl(e.target.value)} inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} />
                            </label>
                            {descGuide && !descGuide.url && descGuide.kind === 'bad' && <span className="hm-guide bad">{descGuide.line}</span>}
                            <span className="hm-hint">{c.fileNote}</span>
                        </div>
                    )}
                    <div className="hm-block">
                        {TWIN_DRAFT_CONSENTS.map((t, i) => (
                            <label key={i} className="hm-consent">
                                <input type="checkbox" checked={agree[i]} onChange={e => setAgree(a => a.map((v, j) => j === i ? e.target.checked : v))} />
                                <span>{t}</span>
                            </label>
                        ))}
                    </div>
                    <button type="button" className="hm-btn wide" disabled={!canDraft} onClick={makeDraft}>{c.draft}</button>
                    {!signedIn && <p className="hm-hint center">{c.draftNote}</p>}
                </div>
            )}
        </section>
    )
}
