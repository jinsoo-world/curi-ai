// domains/os/readers = RSS, Atom 피드를 「최근 글 목록」 글로 바꾼다.
//
// 해석기는 새 부품 없이 domains/os/feeds/parse.ts (자료 자동 가져오기와 같은 것)를 쓴다.
// 목록 한 줄 = 번호. 제목 (날짜, 한국 시간)  +  주소  +  요약 앞부분.

import { htmlToText } from '@/domains/agent/fetch-url'
import { parseFeed, feedTitle, looksLikeFeed, discoverFeedLinks } from '@/domains/os/feeds/parse'

export { looksLikeFeed, discoverFeedLinks }

/** 목록에 넣는 글 수 */
export const FEED_LIST_MAX_ITEMS = 15
/** 글 하나당 요약 글자 수 */
const SUMMARY_CHARS = 220

/** ISO 시각 → 「2026-09-28 19:02」 (한국 시간) */
export function kstStamp(iso?: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const k = new Date(d.getTime() + 9 * 3600_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`
}

export interface FeedDigest {
    title: string
    text: string
    count: number
}

/**
 * 피드 XML → 최근 글 목록 글. 글이 하나도 없으면 null.
 * @param url 피드 주소 (제목이 없을 때 대신 쓰고, 상대 주소를 풀 때 쓴다)
 */
export function feedToText(xml: string, url: string, maxItems = FEED_LIST_MAX_ITEMS): FeedDigest | null {
    const entries = parseFeed(xml)
    if (entries.length === 0) return null
    const name = feedTitle(xml) || safeHost(url)
    const recent = [...entries]
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
        .slice(0, maxItems)
    const lines = recent.map((e, i) => {
        const when = kstStamp(e.publishedAt)
        const summary = htmlToText(e.description || e.content || '').replace(/\s+/g, ' ').trim().slice(0, SUMMARY_CHARS)
        let link = e.url
        try { link = new URL(e.url, url).toString() } catch { /* 그대로 */ }
        return [
            `${i + 1}. ${e.title || '(제목 없음)'}${when ? ` (${when})` : ''}`,
            `   ${link}`,
            summary ? `   ${summary}` : '',
        ].filter(Boolean).join('\n')
    })
    const head = `[RSS 피드] ${name}\n주소: ${url}\n전체 ${entries.length}개 중 최근 ${recent.length}개`
    return { title: `${name} (RSS)`.slice(0, 120), text: `${head}\n\n${lines.join('\n\n')}`, count: entries.length }
}

function safeHost(url: string): string {
    try { return new URL(url).hostname } catch { return url || '피드' }
}
