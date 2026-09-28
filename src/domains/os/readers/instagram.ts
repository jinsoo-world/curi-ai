/**
 * 인스타그램 공개 계정 글 읽기 (로그인 없이). 대표 지시 0929 「인스타그램도 자동으로 읽게 해」.
 * 인스타가 다른 사이트에 끼워 넣으라고 공개하는 퍼가기 화면(/{계정}/embed/)에 최근 게시물 글이 들어 있다.
 * 게시물 주소(/p/..)는 그 게시물의 퍼가기 화면(/p/../embed/captioned/)에서 글을 읽는다.
 */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

export interface InstagramPost { text: string }

/** 인스타 주소 → 계정 이름 또는 게시물 코드 */
export function parseInstagramUrl(raw: string): { user?: string; post?: string } | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'tv') return parts[1] ? { post: parts[1] } : null
    if (parts[0] && !['explore', 'accounts', 'stories', 'direct'].includes(parts[0])) return { user: parts[0].replace(/^@/, '') }
    return null
}

/** 퍼가기 화면 안 데이터(따옴표가 두 번 감싸인 글)에서 게시물 글 뽑기 */
export function extractInstagramEmbedPosts(html: string, max = 5): InstagramPost[] {
    const out: InstagramPost[] = []
    const seen = new Set<string>()
    const re = /\\"text\\":\\"((?:[^"\\]|\\\\[^"]|\\\\\\")*?)\\"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < max) {
        let t: string
        try {
            const once = JSON.parse(`"${m[1]}"`) as string
            t = JSON.parse(`"${once.replace(/"/g, '\\"')}"`) as string
        } catch { continue }
        t = t.trim()
        if (t.length < 20 || /^By using Meta AI/.test(t)) continue
        const key = t.slice(0, 80)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ text: t })
    }
    return out
}

/** 게시물 하나 퍼가기 화면의 글 (class="Caption") */
export function extractInstagramCaption(html: string): string {
    const m = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/)
    if (!m) return ''
    return m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/[ \t]+/g, ' ').trim()
}

export async function readInstagram(url: string, opts: { timeoutMs?: number; max?: number } = {}): Promise<{ ok: true; posts: InstagramPost[] } | { ok: false; reason: string }> {
    const t = parseInstagramUrl(url)
    if (!t) return { ok: false, reason: '인스타그램 계정 주소를 확인해 주세요' }
    const target = t.post ? `https://www.instagram.com/p/${encodeURIComponent(t.post)}/embed/captioned/` : `https://www.instagram.com/${encodeURIComponent(t.user!)}/embed/`
    try {
        const r = await fetch(target, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) })
        if (!r.ok) return { ok: false, reason: `인스타그램이 열리지 않아요 (${r.status})` }
        const html = await r.text()
        const posts = t.post
            ? (() => { const c = extractInstagramCaption(html); return c.length >= 10 ? [{ text: c }] : [] })()
            : extractInstagramEmbedPosts(html, opts.max ?? 5)
        if (posts.length === 0) return { ok: false, reason: '공개된 게시물 글을 찾지 못했어요' }
        return { ok: true, posts }
    } catch {
        return { ok: false, reason: '인스타그램을 읽는 데 시간이 너무 걸렸어요' }
    }
}
