// domains/os/readers/medium = 미디엄 주소 읽는 법 (밖에 나가지 않는 순수 함수 + 피드 한 번 읽기).
//
// 미디엄 글 화면은 서버에서 열면 막힐 때가 많다(403). 그래서
//   계정, 매체 주소  → 공식 RSS (medium.com/feed/@계정, medium.com/feed/매체, 이름.medium.com/feed) 로 읽는다
//   글 하나 주소     → 화면을 먼저 열어 보고, 막히면 그 계정 RSS 안에서 같은 글을 찾는다 (RSS 는 최근 글만 준다)
// 밖으로 나가는 요청은 전부 fetchPageSafely(주소 안전 검사 + 크기, 시간 한도)를 지난다.

import { fetchPageSafely, htmlToText } from '@/domains/agent/fetch-url'
import type { ReadPage, ReadFail } from '@/domains/agent/fetch-url'
import { parseFeed, looksLikeFeed } from '@/domains/os/feeds/parse'

const RESERVED = new Set(['p', 'm', 'me', 'feed', 'topics', 'topic', 'tag', 'search', 'plans', 'membership', 'creators', 'jobs', 'about', 'new-story', 'new', 'policy', 'help', 'business', 'partner-program', 'sitemap', 'tm', 'media', 'r', 'trending', 'following', 'lists', 'notifications', 'library', 'stories', 'settings', 'signin', 'login', 'verify', 'subscribe', 'gift'])
const SYSTEM_SUBDOMAINS = /^(www|api|cdn-images-\d+|miro|help|policy|speechify|link)$/

export function isMediumHost(host: string): boolean {
    const h = String(host ?? '').toLowerCase().replace(/^www\./, '')
    return h === 'medium.com' || h.endsWith('.medium.com')
}

/** 이름.medium.com 의 이름 (시스템 주소는 null) */
function subdomainOf(host: string): string | null {
    const h = host.toLowerCase()
    if (!h.endsWith('.medium.com')) return null
    const sub = h.slice(0, -'.medium.com'.length)
    return sub && !SYSTEM_SUBDOMAINS.test(sub) ? sub : null
}

/** 글 하나 주소인가 (끝 칸이 「제목-12자리 영숫자」, 또는 medium.com/p/번호) */
export function isMediumPostUrl(raw: string): boolean {
    let u: URL
    try { u = new URL(raw) } catch { return false }
    if (!isMediumHost(u.hostname)) return false
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'p' && parts[1]) return /^[0-9a-f]{8,16}$/i.test(parts[1])
    const last = parts[parts.length - 1] ?? ''
    return parts.length >= (subdomainOf(u.hostname) ? 1 : 2) && /-[0-9a-f]{10,12}$/i.test(last)
}

/** 글 번호 (주소 끝 12자리). 못 찾으면 null */
export function mediumPostId(raw: string): string | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'p' && parts[1]) return parts[1].toLowerCase()
    const m = (parts[parts.length - 1] ?? '').match(/-([0-9a-f]{10,12})$/i)
    return m ? m[1].toLowerCase() : null
}

/** 미디엄 계정, 매체, 글 주소 → 그 계정의 RSS 주소. 못 만들면 null */
export function mediumFeedUrl(raw: string): string | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    if (!isMediumHost(u.hostname)) return null
    const sub = subdomainOf(u.hostname)
    if (sub) return `https://${sub}.medium.com/feed`
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'feed' && parts[1]) return `https://medium.com/feed/${parts[1]}`
    if (!parts[0] || parts[0] === 'p') return null
    if (parts[0].startsWith('@')) return /^@[A-Za-z0-9._-]{1,60}$/.test(parts[0]) ? `https://medium.com/feed/${parts[0]}` : null
    if (RESERVED.has(parts[0].toLowerCase())) return null
    return /^[A-Za-z0-9._-]{1,80}$/.test(parts[0]) ? `https://medium.com/feed/${parts[0]}` : null
}

/**
 * 미디엄 글 하나를 그 계정 RSS 에서 찾아 읽는다. 화면이 막혔을 때의 길.
 * RSS 는 최근 글 몇 편만 줘서 오래된 글은 못 찾는다(null).
 */
export async function readMediumFromFeed(postUrl: string, o: { timeoutMs: number; maxBytes?: number; maxChars: number }): Promise<ReadPage | ReadFail | null> {
    const feedUrl = mediumFeedUrl(postUrl)
    const id = mediumPostId(postUrl)
    if (!feedUrl || !id) return null
    const page = await fetchPageSafely(feedUrl, { maxBytes: Math.min(o.maxBytes ?? 5 * 1024 * 1024, 5 * 1024 * 1024), timeoutMs: o.timeoutMs })
    if (!page.ok) return page
    if (!looksLikeFeed(page.body)) return null
    const hit = parseFeed(page.body).find(e => e.url.toLowerCase().includes(id))
    if (!hit) return null
    const a = htmlToText(hit.content || '')
    const b = htmlToText(hit.description || '')
    const text = (a.length >= b.length ? a : b).slice(0, o.maxChars)
    if (text.replace(/\s+/g, '').length < 30) return null
    return { ok: true, url: postUrl, requestedUrl: postUrl, title: (hit.title || '미디엄 글').slice(0, 120), text, kind: 'web', method: 'feed', source: 'feed' }
}
