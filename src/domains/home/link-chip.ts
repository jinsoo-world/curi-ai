// domains/home: /home 입력칸 자료 칩 (대표 지시 0929 01:09). 주소를 붙이면 둥근 칩(곳 아이콘, 제목 한 줄, 빼기)으로 바뀐다.
// 못 읽는다는 말은 /home 에서 하지 않는다. 모든 주소를 받는다. 제목은 /api/home/link-title 이 채우고, 그 전에는 주소로 만든 이름을 쓴다.

export type HomeLinkPlatform = 'youtube' | 'instagram' | 'threads' | 'blog' | 'tistory' | 'brunch' | 'shop' | 'web'

export const HOME_PLATFORM_LABEL: Record<HomeLinkPlatform, string> = {
    youtube: '유튜브',
    instagram: '인스타그램',
    threads: '스레드',
    blog: '네이버 블로그',
    tistory: '티스토리',
    brunch: '브런치',
    shop: '상품',
    web: '웹',
}

/** 곳 고르기 칸(copy.chips 의 id)과 칩 곳을 잇는다 */
export const HOME_TAB_OF: Record<HomeLinkPlatform, string> = {
    youtube: 'youtube', instagram: 'instagram', threads: 'threads', blog: 'blog', tistory: 'blog', brunch: 'blog', shop: 'shop', web: '',
}

const SHOP_HOSTS = ['smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com', 'coupang.com', '11st.co.kr', 'gmarket.co.kr', 'auction.co.kr', 'kream.co.kr', 'musinsa.com', 'idus.com', 'ohou.se', 'amazon.com', 'aliexpress.com', 'kurly.com', 'ssg.com', 'lotteon.com', 'tmon.co.kr', 'wemakeprice.com']

function parse(raw: string): URL | null {
    const t = String(raw ?? '').trim()
    try { return new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`) } catch { return null }
}

/** 붙여 넣은 낱말이 주소처럼 보이나 (점 뒤 영문 끝말이 있어야 한다. 「안녕하세요.」 같은 글은 아니다) */
export function looksLikeLink(s: string): boolean {
    return /^(https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(String(s ?? '').trim())
}

/** 붙여 넣은 글에서 주소와 나머지를 가른다 */
export function splitLinks(text: string): { links: string[]; rest: string } {
    const parts = String(text ?? '').split(/[\s,]+/).filter(Boolean)
    const links = parts.filter(looksLikeLink)
    const rest = parts.filter(p => !looksLikeLink(p)).join(' ')
    return { links, rest }
}

export function homeLinkPlatform(raw: string): HomeLinkPlatform {
    const u = parse(raw)
    if (!u) return 'web'
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    const is = (h: string) => host === h || host.endsWith(`.${h}`)
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') return 'youtube'
    if (is('instagram.com')) return 'instagram'
    if (is('threads.net') || is('threads.com')) return 'threads'
    if (host === 'blog.naver.com' || host === 'rss.blog.naver.com') return 'blog'
    if (is('tistory.com')) return 'tistory'
    if (is('brunch.co.kr')) return 'brunch'
    if (SHOP_HOSTS.some(is) || /\/(product|products|goods|item|items|shop)(\/|$)/i.test(u.pathname)) return 'shop'
    return 'web'
}

/** 제목을 받기 전, 또는 못 받았을 때 보여 줄 이름 (주소로 만든다) */
export function homeLinkFallbackTitle(raw: string): string {
    const u = parse(raw)
    if (!u) return String(raw ?? '').trim()
    const p = homeLinkPlatform(raw)
    const seg = u.pathname.split('/').filter(Boolean)
    const host = u.hostname.replace(/^(www|m)\./, '')
    const label = HOME_PLATFORM_LABEL[p]
    const at = (s?: string) => (s ? (s.startsWith('@') ? s : `@${s}`) : '')
    switch (p) {
        case 'youtube':
            if (seg[0]?.startsWith('@')) return `${label} ${seg[0]}`
            if (u.searchParams.get('v') || host === 'youtu.be' || seg[0] === 'shorts') return `${label} 영상`
            return label
        case 'instagram':
        case 'threads':
            return seg[0] && !['p', 'reel', 'reels', 'stories', 't', 'post'].includes(seg[0]) ? `${label} ${at(seg[0])}` : label
        case 'blog':
            return seg[0] ? `${label} ${seg[0]}` : label
        case 'tistory':
            return `${label} ${host.split('.')[0]}`
        case 'brunch':
            return seg[0] ? `${label} ${seg[0]}` : label
        default:
            return seg[0] ? `${host}/${decodeURIComponent(seg[0]).slice(0, 30)}` : host
    }
}

const GENERIC = /^(instagram|threads|youtube|facebook|login|log in|로그인|네이버 블로그|naver blog|tistory|brunch|error|access denied|just a moment\.*|attention required.*)$/i

/** 받아 온 제목 다듬기: 공백 정리, 곳 이름 꼬리 떼기, 가운데점과 긴 줄표는 띄어쓰기로, 80자 */
export function cleanLinkTitle(raw: string | null | undefined): string | null {
    let t = String(raw ?? '').replace(/\s+/g, ' ').trim()
    // 인스타, 스레드 기본 제목: "이름(@id) • Instagram 사진 및 동영상" → "이름(@id)"
    t = t.replace(/\s*[•·|\-–—]\s*(Instagram|Threads)\b.*$/i, '').trim()
    t = t.replace(/[•·—–]/g, ' ').replace(/\s+/g, ' ')
    t = t.replace(/\s*[|-]\s*(YouTube|Instagram|Threads|네이버 블로그|Naver Blog|티스토리|Tistory|브런치스토리|브런치)\s*$/i, '').trim()
    // 이름 없이 "(@id)"만 남으면 괄호를 벗겨요
    t = t.replace(/^\((@[\w.]+)\)$/, '$1')
    if (!t || GENERIC.test(t)) return null
    return t.length > 80 ? `${t.slice(0, 79)}…` : t
}
