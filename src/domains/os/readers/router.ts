// domains/os/readers = 주소 모양을 보고 어느 길로 읽을지 고른다 (밖에 나가지 않는 순수 함수).
//
// 「링크 읽기」 6갈래 (Agent Reach 의 열쇠 없는 길을 우리 서버에 직접 옮김, 로그인 쿠키가 필요한 곳은 안 한다)
//   youtube    = 영상 하나 (자막 + 제목 + 채널 + 설명)
//   github     = 저장소, 이슈, PR, 파일 (공개 API, 열쇠 없음)
//   naver-blog = 네이버 블로그 (액자 안 PostView 본문)
//   naver-news = 네이버 뉴스 (기사 본문 칸)
//   feed       = RSS, Atom 주소처럼 보이는 것 (실제로는 내용을 보고 한 번 더 판정한다)
//   web        = 그 밖의 웹페이지, 신문 기사 (readability 본문 추출)
//   instagram  = 인스타그램 공개 계정, 게시물 (퍼가기 화면, 0929)
//   threads    = 스레드 공개 프로필 (0929)
// X, 레딧, 링크드인, 페이스북처럼 로그인해야 보이는 곳은 web 으로 떨어지고,
// 거기서 글을 못 찾으면 「못 읽었어요」로 끝난다(몰래 로그인하지 않는다).

import { youtubeVideoId } from './youtube'

export type LinkKind = 'youtube' | 'github' | 'naver-blog' | 'naver-news' | 'instagram' | 'threads' | 'feed' | 'web'

/** GitHub 주소 첫 칸이 사람, 단체 이름이 아닌 것 (github.com/settings 같은 화면) */
const GITHUB_RESERVED = new Set([
    'settings', 'orgs', 'marketplace', 'topics', 'features', 'login', 'join', 'explore', 'sponsors', 'about',
    'pricing', 'collections', 'trending', 'search', 'notifications', 'new', 'organizations', 'apps', 'enterprise',
    'customer-stories', 'security', 'readme', 'events', 'site', 'contact', 'team', 'codespaces', 'pulls', 'issues',
])

function hostOf(raw: string): string {
    try { return new URL(raw).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

/** 주소 하나가 어느 길인가. 모르면 web */
export function classifyUrl(raw: string): LinkKind {
    let u: URL
    try { u = new URL(String(raw ?? '')) } catch { return 'web' }
    const host = hostOf(u.toString())

    if (youtubeVideoId(u.toString())) return 'youtube'
    if (host === 'github.com' && parseGithubUrl(u.toString())) return 'github'
    if (host === 'blog.naver.com' || host === 'm.blog.naver.com') return 'naver-blog'
    if (host === 'n.news.naver.com' || host === 'news.naver.com' || host === 'm.news.naver.com') return 'naver-news'
    if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
    if (host === 'threads.net' || host === 'threads.com' || host.endsWith('.threads.net') || host.endsWith('.threads.com')) return 'threads'
    if (looksLikeFeedUrl(u)) return 'feed'
    return 'web'
}

/** 주소만 보고 RSS, Atom 같아 보이는가 (확정은 내용을 받아 본 뒤) */
export function looksLikeFeedUrl(u: URL): boolean {
    const host = u.hostname.toLowerCase()
    const path = u.pathname.toLowerCase()
    if (/^(rss|feeds?)\./.test(host)) return true
    if (/\.(rss|atom)$/.test(path)) return true
    if (/(^|\/)(rss|feed|feeds|atom)(\/|\.xml|\.php)?$/.test(path)) return true
    if (/(^|\/)(rss|feed)[^/]*\.xml$/.test(path)) return true
    if (/\/(rss|outboundfeeds)\//.test(path)) return true
    return false
}

export interface GithubTarget {
    owner: string
    repo: string
    /** repo = 저장소 첫 화면, issue/pull = 이슈나 PR 한 건, blob = 파일 하나, tree = 폴더(저장소처럼 읽는다) */
    type: 'repo' | 'issue' | 'pull' | 'blob' | 'tree'
    number?: number
    ref?: string
    path?: string
}

/** github.com 주소를 쪼갠다. 저장소 주소가 아니면 null */
export function parseGithubUrl(raw: string): GithubTarget | null {
    let u: URL
    try { u = new URL(String(raw ?? '')) } catch { return null }
    if (hostOf(u.toString()) !== 'github.com') return null
    const parts = u.pathname.split('/').filter(Boolean).map(p => decodeURIComponent(p))
    if (parts.length < 2) return null
    const [owner, repoRaw, kind, ...rest] = parts
    if (GITHUB_RESERVED.has(owner.toLowerCase())) return null
    const repo = repoRaw.replace(/\.git$/i, '')
    const okName = (s: string) => /^[A-Za-z0-9_.-]{1,100}$/.test(s)
    if (!okName(owner) || !okName(repo)) return null

    if ((kind === 'issues' || kind === 'pull') && rest[0] && /^\d{1,9}$/.test(rest[0])) {
        return { owner, repo, type: kind === 'pull' ? 'pull' : 'issue', number: Number(rest[0]) }
    }
    if (kind === 'blob' && rest.length >= 2) {
        return { owner, repo, type: 'blob', ref: rest[0], path: rest.slice(1).join('/') }
    }
    if (kind === 'tree' && rest.length >= 1) {
        return { owner, repo, type: 'tree', ref: rest[0], path: rest.slice(1).join('/') }
    }
    return { owner, repo, type: 'repo' }
}
