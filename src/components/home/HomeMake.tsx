'use client'
// /home 맨 위 입력칸: 주소를 넣으면 바로 판별해 한 줄로 알려 준다 (가입 없이).
// 「초안 만들기」를 누르면 넣은 것을 브라우저에 보관하고, 로그인한 사람은 /os 로, 아닌 사람은 가입(로그인)으로 보낸다.
// 가입 직후 /os 가 보관분을 읽어 「내 링크로 만들기」 초안을 이어 만든다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { HOME_COPY } from '@/domains/home/copy'
import { BARE_ID_PLACES, homeLinkGuide } from '@/domains/home/link-guide'
import { HOME_DRAFT_NEXT, saveHomeDraft } from '@/domains/home/draft-store'
import { TWIN_DRAFT_CONSENTS, TWIN_DRAFT_MAX_LINKS } from '@/domains/os/twin-draft-shared'

const PASTE_MIN = 30
const longEnough = (t: string) => t.replace(/\s+/g, '').length >= PASTE_MIN

export default function HomeMake() {
    const c = HOME_COPY
    const [text, setText] = useState('')
    const [links, setLinks] = useState<string[]>([])
    const [paste, setPaste] = useState('')
    const [direct, setDirect] = useState(false)
    const [desc, setDesc] = useState('')
    const [descUrl, setDescUrl] = useState('')
    const [agree, setAgree] = useState<boolean[]>(() => TWIN_DRAFT_CONSENTS.map(() => false))
    const [placeholder, setPlaceholder] = useState<string>(c.placeholder)
    const [fileNote, setFileNote] = useState(false)
    const [panel, setPanel] = useState(false)
    const [signedIn, setSignedIn] = useState(false)
    const [going, setGoing] = useState(false)
    const input = useRef<HTMLInputElement>(null)
    const descBox = useRef<HTMLTextAreaElement>(null)

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

    const guide = text.trim() ? homeLinkGuide(text) : null
    const linkGuides = useMemo(() => links.map(l => ({ url: l, g: homeLinkGuide(l) })), [links])
    const needPaste = linkGuides.some(x => x.g.needPaste)
    const descGuide = descUrl.trim() ? homeLinkGuide(descUrl) : null

    const addLink = () => {
        if (!guide) { if (links.length) setPanel(true); else input.current?.focus(); return }
        if (!guide.url) return
        setLinks(ls => ls.includes(guide.url as string) ? ls : [...ls, guide.url as string].slice(0, TWIN_DRAFT_MAX_LINKS))
        setText(''); setPanel(true)
    }

    const pastes = [paste, direct ? desc : ''].filter(longEnough)
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

            <div className="hm-chips" role="group" aria-label="넣을 곳 고르기">
                {c.chips.map(ch => (
                    <button key={ch.id} type="button" className="hm-chip" onClick={() => {
                        if (ch.id === 'file') { setFileNote(true); return }
                        setFileNote(false); setPlaceholder(ch.example); input.current?.focus()
                    }}>{ch.label}</button>
                ))}
            </div>

            <form className="hm-inputrow" onSubmit={e => { e.preventDefault(); addLink() }}>
                <input
                    id="hm-input" ref={input} className="hm-input" value={text} onChange={e => setText(e.target.value)}
                    placeholder={placeholder} aria-label={c.placeholder} autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url"
                />
                <button type="submit" className="hm-btn">{c.make}</button>
            </form>

            {guide && (
                <p className={`hm-guide ${guide.kind === 'bad' ? 'bad' : ''}`} aria-live="polite">{guide.line}</p>
            )}
            {guide?.kind === 'bareId' && (
                <div className="hm-chips" role="group" aria-label={guide.line}>
                    {BARE_ID_PLACES.map(p => (
                        <button key={p.id} type="button" className="hm-chip" onClick={() => setText(p.url(text.trim().replace(/^@/, '')))}>{p.label}</button>
                    ))}
                </div>
            )}
            {fileNote && <p className="hm-guide">{c.fileNote}</p>}

            <p className="hm-safe">{c.safe}</p>
            <button type="button" className="hm-direct" onClick={() => { setDirect(true); setPanel(true); window.setTimeout(() => descBox.current?.focus(), 50) }}>{c.direct}</button>

            {panel && (
                <div className="hm-panel">
                    {linkGuides.length > 0 && (
                        <div className="hm-block">
                            <div className="hm-label">{c.added}</div>
                            <ul className="hm-links">
                                {linkGuides.map(({ url, g }) => (
                                    <li key={url}>
                                        <span className="hm-link-url">{url.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                        <span className="hm-link-line">{g.line}</span>
                                        <button type="button" className="hm-x" onClick={() => setLinks(ls => ls.filter(x => x !== url))}>{c.remove}</button>
                                    </li>
                                ))}
                            </ul>
                            {links.length < TWIN_DRAFT_MAX_LINKS && <p className="hm-hint">{c.addMore}</p>}
                        </div>
                    )}
                    {needPaste && (
                        <label className="hm-block">
                            <span className="hm-label">{c.pasteLabel}</span>
                            <textarea className="hm-text" rows={5} value={paste} onChange={e => setPaste(e.target.value)} placeholder={c.pastePlaceholder} />
                            {paste.trim() && !longEnough(paste) && <span className="hm-hint">{c.directShort}</span>}
                        </label>
                    )}
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
                            {descGuide && <span className={`hm-guide ${descGuide.url ? '' : 'bad'}`}>{descGuide.line}</span>}
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
