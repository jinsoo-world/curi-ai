/**
 * 인스타그램, 스레드 공개 페이지를 읽는 공통 부분 (대표 지시 1005 「링크만 붙여도 되게」).
 *
 * 측정(1005, 실제 서버 지역 icn1과 외부 기계에서 같은 결과):
 *   - 브라우저 이름표로 받으면 자바스크립트 껍데기만 오고 글이 없다 (예전 읽기가 멈춘 이유).
 *   - 링크 미리보기 수집기 이름(facebookexternalhit)으로 받으면
 *       인스타그램 계정 퍼가기 화면과 게시물 퍼가기 화면에 공개 글이 들어 있고,
 *       게시물 화면의 og:description 에도 글 전체가 있다. 스레드 글 하나도 og:description 에 있다.
 *   - 인스타그램 계정 화면 자체와 스레드 계정 화면의 글 목록은, 검색엔진 수집기 이름일 때만 나온다.
 *     검색엔진을 흉내 내는 일이라 기본으로 끄고, 환경변수 SNS_SEARCHBOT_FALLBACK=1 일 때만 쓴다(대표 결정 필요).
 */

/** 링크 미리보기 수집기 이름. 사람이 링크를 붙였을 때 카톡, 슬랙이 하는 일과 같다 */
export const PREVIEW_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
export const SEARCHBOT_UA = 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'

export function searchbotFallbackOn(): boolean {
    return process.env.SNS_SEARCHBOT_FALLBACK === '1'
}

/** 읽기 실패 갈래 (화면 문구는 link-rules.ts 의 LINK_FAIL_LINE 이 가진다) */
export type SnsFailCode = 'not_public' | 'blocked' | 'empty' | 'timeout' | 'profile_only' | 'bad_url'

export interface SnsFail { ok: false; code: SnsFailCode; status?: number; reason: string }

/** 받침 있으면 첫째, 없으면 둘째 (이/가, 을/를) */
export function josa(word: string, withBatchim: string, without: string): string {
    const c = word.trim().slice(-1).charCodeAt(0)
    if (c < 0xac00 || c > 0xd7a3) return without
    return (c - 0xac00) % 28 === 0 ? without : withBatchim
}

export const SNS_REASON: Record<SnsFailCode, (site: string) => string> = {
    not_public: s => `${s}에서 글을 읽지 못했어요. 비공개 계정이거나 주소가 달라요`,
    blocked: s => `${s}${josa(s, '이', '가')} 지금 읽기를 막고 있어요`,
    empty: s => `${s}에서 읽을 글을 찾지 못했어요`,
    timeout: s => `${s}${josa(s, '을', '를')} 읽는 데 시간이 너무 걸렸어요`,
    profile_only: s => `${s} 계정은 소개만 보여요. 읽을 글 주소를 넣거나 글을 붙여넣어 주세요`,
    bad_url: s => `${s} 주소를 확인해 주세요`,
}

export function snsFail(site: string, code: SnsFailCode, status?: number): SnsFail {
    return { ok: false, code, status, reason: SNS_REASON[code](site) }
}

/** 이름표를 바꿔 한 번 받아 온다. 던지지 않는다 */
export async function getPage(url: string, ua: string, timeoutMs: number): Promise<{ ok: true; status: number; html: string } | { ok: false; code: 'blocked' | 'timeout' | 'not_public'; status?: number }> {
    try {
        const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
        if (!r.ok) return { ok: false, code: r.status === 404 || r.status === 410 ? 'not_public' : 'blocked', status: r.status }
        return { ok: true, status: r.status, html: await r.text() }
    } catch (e) {
        const name = e instanceof Error ? e.name : ''
        return { ok: false, code: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'blocked' }
    }
}

/** HTML 글자 풀기 (&#x..; &#..; &amp; 등) */
export function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

export function metaContent(html: string, prop: string): string {
    const re = new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, 'i')
    const m = html.match(re) ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, 'i'))
    return m ? decodeEntities(m[1]).trim() : ''
}

/** 인스타그램, 스레드 페이지 안 데이터의 글 (JSON 한 겹: "caption":{"pk":"..","text":".."}) */
export function extractCaptionJson(html: string, max = 5): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    const re = /"caption":\{"(?:pk":"\d+","text|text)":"((?:[^"\\]|\\.){10,6000})"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < max) {
        let t: string
        try { t = JSON.parse(`"${m[1]}"`) as string } catch { continue }
        t = t.trim()
        if (t.length < 10) continue
        const key = t.slice(0, 80)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(t)
    }
    return out
}
