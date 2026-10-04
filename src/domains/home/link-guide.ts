// domains/home: /home 첫 화면 입력칸 즉시 판별 (브라우저에서 돈다. 서버 코드 없음). 대표 지시 0928 23:53, 설계안 3.1.
// 서버의 classifySnsLink(sns-link.ts)와 같은 갈래에 티스토리, 브런치, 아이디만, 상품 주소 규칙을 더했다.
// 읽는 방법: 유튜브는 자막과 설명, 네이버 블로그와 티스토리는 RSS, 브런치와 공개 웹은 웹으로 읽는다. 인스타그램, 스레드는 공개 계정이면 자동으로 읽고, 비공개면 붙여넣기나 캡처.

export type HomeLinkKind = 'youtube' | 'tistory' | 'feed' | 'web' | 'shop' | 'paste' | 'capture' | 'market' | 'bareId' | 'bad'

export interface HomeLinkGuide {
    kind: HomeLinkKind
    /** 판별 뒤 보여 줄 한 줄 */
    line: string
    /** 초안에 링크로 넘길 주소 (아이디만, 모양이 틀린 것은 null) */
    url: string | null
    /** 글 붙여넣기 칸을 보여 줄까 */
    needPaste: boolean
}

// /home 에서는 못 읽는다는 말을 하지 않는다 (대표 지시 0929 01:09). 붙여넣기와 캡처 대신 받기는 서버 쪽에서 한다
export const HOME_LINK_LINES: Record<HomeLinkKind, string> = {
    youtube: '유튜브 채널이에요. 영상 자막과 설명을 읽어 초안을 만들어요',
    tistory: '티스토리 블로그예요. 최근 글을 읽어요',
    feed: '공개 글을 읽어요',
    web: '공개된 글을 읽어요',
    shop: '내 쇼핑몰 상품 주소예요. 공개된 상품 설명을 읽어요',
    paste: '공개된 글을 읽어요',
    capture: '공개된 글을 읽어요',
    market: '공개된 상품 설명을 읽어요',
    bareId: '어디 아이디인가요?',
    bad: '주소나 아이디를 다시 확인해 주세요',
}

/** 아이디만 넣었을 때 고르는 곳 */
export const BARE_ID_PLACES = [
    { id: 'instagram', label: '인스타그램', url: (v: string) => `https://www.instagram.com/${v}` },
    { id: 'youtube', label: '유튜브', url: (v: string) => `https://www.youtube.com/@${v}` },
    { id: 'threads', label: '스레드', url: (v: string) => `https://www.threads.net/@${v}` },
    { id: 'naver', label: '네이버 블로그', url: (v: string) => `https://blog.naver.com/${v}` },
    { id: 'tistory', label: '티스토리', url: (v: string) => `https://${v}.tistory.com` },
] as const

/** 약관 확인 전까지 자동으로 읽지 않는 큰 장터 */
const MARKETS = ['smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com', 'coupang.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'kream.co.kr', 'musinsa.com', 'idus.com', 'ohou.se', 'amazon.com', 'aliexpress.com', 'kurly.com', 'ssg.com', 'lotteon.com', 'tmon.co.kr', 'wemakeprice.com']
const CAPTURE = ['instagram.com', 'threads.net', 'threads.com', 'facebook.com', 'fb.com', 'x.com', 'twitter.com', 'tiktok.com']

export function isMarketHost(host: string): boolean {
    const h = host.toLowerCase().replace(/^(www|m)\./, '')
    return MARKETS.some(m => h === m || h.endsWith(`.${m}`))
}

const BARE_ID = /^@?[A-Za-z0-9._-]{2,40}$/

export function homeLinkGuide(raw: string): HomeLinkGuide {
    const t = String(raw ?? '').trim()
    const g = (kind: HomeLinkKind, url: string | null, needPaste = false): HomeLinkGuide => ({ kind, line: HOME_LINK_LINES[kind], url, needPaste })
    if (!t) return g('bad', null)
    // 점이 없는 한 낱말 = 아이디만 (@abc, abc)
    if (BARE_ID.test(t) && !t.replace(/^@/, '').includes('.')) return g('bareId', null)
    if (BARE_ID.test(t) && t.startsWith('@')) return g('bareId', null)
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`) } catch { return g('bad', null) }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\s/.test(t)) return g('bad', null)
    const url = u.toString()
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    const is = (h: string) => host === h || host.endsWith(`.${h}`)

    // 인스타그램, 스레드는 읽는다. 못 읽었을 때의 붙여넣기 칸은 만들기 화면이 이유와 함께 연다
    if (CAPTURE.some(is)) return g('capture', url, !(is('instagram.com') || is('threads.net') || is('threads.com')))
    if (host === 'blog.naver.com' || host === 'rss.blog.naver.com' || is('brunch.co.kr')) return g('feed', url)
    if (isMarketHost(host)) return g('market', url, true)
    if (host === 'youtube.com' || host === 'youtu.be') return g('youtube', url)
    if (is('tistory.com') && host !== 'tistory.com') return g('tistory', url)
    if (is('substack.com') || /(\/(rss|feed|atom)(\.xml)?\/?$)|(\.xml$)/i.test(u.pathname)) return g('feed', url)
    if (/\/(product|products|goods|item|items|shop)(\/|$)/i.test(u.pathname)) return g('shop', url)
    return g('web', url)
}
