/**
 * 리더 개인 링크 (SNS) — 대표 지시 2026-09-16
 * 「개인 SNS 링크도 넣을 수 있으면 좋겠다. 리더는 입력할 수 있고, 사람들은 볼 수 있고」
 *
 * 왜 = 코치 화면에서 대화만 하고 끝나면 그 사람을 더 알 길이 없다.
 * 리더에게는 자기 채널로 사람을 보내는 자리가 되고, 보는 사람에게는 이 사람이 진짜라는 증거가 된다.
 *
 * ⚠️ 주소는 남이 적는 값이다. 그대로 화면에 걸면 안 된다.
 *    ①http·https 만 통과시킨다(javascript: 를 걸면 누른 사람 브라우저에서 코드가 돈다)
 *    ②화면에서는 rel="noopener noreferrer nofollow" 를 반드시 붙인다
 */

export interface LinkKind {
    id: string
    label: string
    /** 아이콘 바탕색 */
    color: string
    /** 아이콘 안에 넣을 글자 — 그림이 없는 종류에 쓴다 */
    text?: string
    /** 입력 칸에 보여줄 예시 */
    placeholder: string
    /** 이 주소인지 알아보는 실마리(자동 분류에 쓴다) */
    hosts?: string[]
}

export const LINK_KINDS: LinkKind[] = [
    { id: 'kakao', label: '카카오톡', color: '#FEE500', text: 'TALK', placeholder: 'https://open.kakao.com/o/...', hosts: ['kakao.com', 'kakaocorp.com'] },
    { id: 'blog', label: '블로그', color: '#03C75A', text: 'blog', placeholder: 'https://blog.naver.com/아이디', hosts: ['blog.naver.com', 'tistory.com', 'brunch.co.kr'] },
    { id: 'instagram', label: '인스타그램', color: '#E1306C', placeholder: 'https://instagram.com/아이디', hosts: ['instagram.com'] },
    { id: 'youtube', label: '유튜브', color: '#FF0000', placeholder: 'https://youtube.com/@채널', hosts: ['youtube.com', 'youtu.be'] },
    { id: 'threads', label: '스레드', color: '#18181b', text: '@', placeholder: 'https://threads.net/@아이디', hosts: ['threads.net', 'threads.com'] },
    { id: 'facebook', label: '페이스북', color: '#1877F2', text: 'f', placeholder: 'https://facebook.com/아이디', hosts: ['facebook.com', 'fb.com'] },
    { id: 'curious', label: '큐리어스', color: '#03C124', text: '큐', placeholder: 'https://curious-500.com/v2/...', hosts: ['curious-500.com'] },
    { id: 'home', label: '홈페이지', color: '#52525b', text: 'www', placeholder: 'https://내주소.com' },
]

export function getLinkKind(id: string) { return LINK_KINDS.find(k => k.id === id) }

export interface CreatorLink {
    kind: string
    url: string
}

/** 한 줄짜리 주소를 정리한다. 통과 못 하면 null */
export function 주소정리(raw: unknown): string | null {
    if (typeof raw !== 'string') return null
    let v = raw.trim()
    if (!v) return null
    // 「instagram.com/…」처럼 앞을 빼고 적는 사람이 많다. 사람이 고생할 일이 아니다.
    if (!/^https?:\/\//i.test(v)) {
        if (/^(javascript|data|vbscript|file|mailto|tel):/i.test(v)) return null
        v = `https://${v}`
    }
    let u: URL
    try { u = new URL(v) } catch { return null }
    // http·https 만. 다른 스킴은 누른 사람에게 위험하다.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null
    if (v.length > 500) return null
    return u.toString()
}

/** 주소를 보고 어느 채널인지 알아맞힌다 — 리더가 종류를 안 골라도 되게 */
export function 종류추측(url: string): string {
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch { return 'home' }
    for (const k of LINK_KINDS) {
        if (k.hosts?.some(h => host === h || host.endsWith(`.${h}`))) return k.id
    }
    return 'home'
}

/** 저장 전에 통째로 정리한다 — 서버와 화면이 같은 함수를 쓴다 */
export function 링크정리(raw: unknown): CreatorLink[] {
    if (!Array.isArray(raw)) return []
    const 결과: CreatorLink[] = []
    for (const 하나 of raw.slice(0, 8)) {
        const url = 주소정리((하나 as { url?: unknown })?.url)
        if (!url) continue
        if (결과.some(x => x.url === url)) continue
        const 받은종류 = (하나 as { kind?: unknown })?.kind
        const kind = typeof 받은종류 === 'string' && getLinkKind(받은종류) ? 받은종류 : 종류추측(url)
        결과.push({ kind, url })
    }
    return 결과
}

/** 화면에 짧게 보여줄 글자 — 주소 전체는 길어서 못 쓴다 */
export function 보일이름(link: CreatorLink): string {
    const kind = getLinkKind(link.kind)
    if (kind && kind.id !== 'home') return kind.label
    try { return new URL(link.url).hostname.replace(/^www\./, '') } catch { return link.url }
}
