/**
 * 스레드 공개 프로필 글 읽기 (로그인 없이). 대표 결정 0929 「스레드도 못읽고」.
 * 미리보기용 수집기 이름(facebookexternalhit)으로 받으면 공개 글 본문이 페이지 안 데이터에 들어 있다.
 * 글 본문("text":"...")만 뽑고, 짧은 글과 같은 글은 뺀다.
 */
const UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

export interface ThreadsPost { text: string }

/** 페이지 HTML 에서 글 본문 뽑기 (시험용으로 따로 둠) */
export function extractThreadsPosts(html: string, max = 5): ThreadsPost[] {
    const out: ThreadsPost[] = []
    const seen = new Set<string>()
    const re = /"text":"((?:[^"\\]|\\.){20,4000})"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < max) {
        let t: string
        try { t = JSON.parse(`"${m[1]}"`) as string } catch { continue }
        t = t.trim()
        if (t.length < 20 || /^https?:\/\//.test(t)) continue
        const key = t.slice(0, 80)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ text: t })
    }
    return out
}

/** 프로필 소개 한 줄 (og:description) */
export function extractThreadsBio(html: string): string {
    const m = html.match(/<meta property="og:description" content="([^"]*)"/)
    if (!m) return ''
    return m[1].replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim()
}

export async function readThreads(url: string, opts: { timeoutMs?: number; max?: number } = {}): Promise<{ ok: true; bio: string; posts: ThreadsPost[] } | { ok: false; reason: string }> {
    try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000) })
        if (!r.ok) return { ok: false, reason: `스레드가 열리지 않아요 (${r.status})` }
        const html = await r.text()
        const posts = extractThreadsPosts(html, opts.max ?? 5)
        if (posts.length === 0) return { ok: false, reason: '공개된 스레드 글을 찾지 못했어요' }
        return { ok: true, bio: extractThreadsBio(html), posts }
    } catch {
        return { ok: false, reason: '스레드를 읽는 데 시간이 너무 걸렸어요' }
    }
}
