'use client'
// 채팅 말풍선 아래 그록식 OG 가로 카드. 메타는 /api/os/unfurl 로만 가져온다.

import { useEffect, useMemo, useState } from 'react'
import { extractUrls } from './LinkCards'
import type { UnfurlCard } from '@/domains/os/unfurl'

const cache = new Map<string, UnfurlCard>()

function domainOf(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

function skeleton(url: string): UnfurlCard {
    const domain = domainOf(url)
    return {
        url,
        finalUrl: url,
        title: domain,
        domain,
        description: '',
        imageUrl: null,
        faviconUrl: null,
        ok: false,
    }
}

interface Props {
    text: string
    max?: number
    className?: string
}

export default function OgLinkPreview({ text, max = 3, className }: Props) {
    const urls = useMemo(() => extractUrls(text).slice(0, max), [text, max])
    const [cards, setCards] = useState<UnfurlCard[]>(() => urls.map(u => cache.get(u) ?? skeleton(u)))

    useEffect(() => {
        if (urls.length === 0) { setCards([]); return }
        setCards(urls.map(u => cache.get(u) ?? skeleton(u)))
        const need = urls.filter(u => !cache.has(u))
        if (need.length === 0) return
        let cancelled = false
        ;(async () => {
            try {
                const res = await fetch('/api/os/unfurl', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: need }),
                })
                const data = await res.json().catch(() => ({})) as { cards?: UnfurlCard[] }
                const got = Array.isArray(data.cards) ? data.cards : []
                for (const c of got) cache.set(c.url, c)
                if (cancelled) return
                setCards(urls.map(u => cache.get(u) ?? skeleton(u)))
            } catch {
                /* 골격 유지 */
            }
        })()
        return () => { cancelled = true }
    }, [urls])

    if (urls.length === 0) return null

    return (
        <div className={`os-og-cards${className ? ` ${className}` : ''}`} aria-label="링크 미리보기">
            {cards.map((c, i) => (
                <a
                    key={`${c.url}-${i}`}
                    className="os-og-card"
                    href={c.finalUrl || c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.finalUrl || c.url}
                >
                    <span className="os-og-card-main">
                        <span className="os-og-card-favicon" aria-hidden>
                            {c.faviconUrl
                                ? <img src={c.faviconUrl} alt="" width={18} height={18} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                : <span className="os-og-card-favicon-fallback" />}
                        </span>
                        <span className="os-og-card-text">
                            <span className="os-og-card-title">{c.title || c.domain}</span>
                            <span className="os-og-card-domain">{c.domain}</span>
                        </span>
                    </span>
                    <span className="os-og-card-thumb" aria-hidden>
                        {c.imageUrl
                            ? <img src={c.imageUrl} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                            : <span className="os-og-card-thumb-fallback" />}
                    </span>
                </a>
            ))}
        </div>
    )
}

export function isUrlOnlyText(text: string): boolean {
    const t = String(text ?? '').trim()
    if (!t) return false
    const urls = extractUrls(t)
    if (urls.length === 0) return false
    let rest = t
    for (const u of urls) rest = rest.split(u).join(' ')
    return rest.trim().length === 0
}
