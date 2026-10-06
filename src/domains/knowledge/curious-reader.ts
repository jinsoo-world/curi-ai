// domains/knowledge  큐리어스(curious-500.com, 같은 회사 미션드리븐 서비스) 공개 화면을 글로 읽는다.
//
// 대표 지시 1005 13:12 「큐리어스 간이 CLI 하나 만들어서」 큐리AI 가 큐리어스 링크를 제대로 읽게.
// 왜 따로 두나 = curious-500.com/v2/... 화면은 서버 HTML 에 제목과 og:description 만 있고
// 본문은 브라우저가 같은 사이트의 공개 데이터 창구(/api/v2/...)에서 따로 불러 그린다.
// 그래서 일반 웹 읽기(readability)로는 본문이 안 잡힌다. 화면이 부르는 그 공개 창구를 똑같이 부른다.
//
// 지키는 것
//  1. 로그인 없이 브라우저가 부르는 GET 만. 쿠키, 열쇠, 관리자 창구, 쓰기 요청은 쓰지 않는다.
//  2. 나가는 곳은 https://curious-500.com/api/v2 하나로 고정. 번호는 숫자만 받는다(주소를 사람이 못 바꾼다).
//     서버에서는 부르는 쪽(readers/index.ts)이 fetchPageSafely(SSRF 검사, 크기, 시간 한도)를 넣어 준다.
//  3. 공개 창구에 있어도 넣지 않는 것: 카카오 오픈채팅 주소와 입장 코드, 전자책 파일 주소, 회원 번호.
//  4. 이 파일은 바깥 모듈을 하나도 불러오지 않는다. 그래서 scripts/curious-cli.mjs 가 Node 로 바로 부를 수 있다.
//
// 읽는 곳 (화면 주소 → 공개 창구)
//   /v2/membership/explore/{id}  멤버십  → /membership/{id}, /membership/{id}/price-list, /schedules, /categories
//   /v2/study/{id}, /study/{id}  어울림(강의, 챌린지, 모임) → /study-pages/{id}, /studies/{id}/reviews
//   /v2/creator/{id}, /v2/leader/{id}  리더 → /leaders/{id}, /working-records, /study-reviews, /creators/{id}/page
//   /v2/digital-content/{id}, /book/{id}  디지털콘텐츠(전자책) → /digital-content/book/{id}
//   /v2/community  커뮤니티 첫 화면 → /posts/categories, /posts?category_number=0, /posts/popular, 최근 글 몇 개
//   /v2/community/post/{id}  공개 게시글 → /posts/{id}, /posts/{id}/comments

import { stripHtmlBlocks } from '@/lib/html-strip'

export const CURIOUS_ORIGIN = 'https://curious-500.com'
export const CURIOUS_API = `${CURIOUS_ORIGIN}/api/v2`

export type CuriousKind = 'membership' | 'study' | 'leader' | 'digital-content' | 'community' | 'post'

export interface CuriousTarget {
    kind: CuriousKind
    /** community 만 없다 */
    id?: number
}

export interface CuriousImage {
    url: string
    /** 무슨 사진인가 (대표 사진, 리더 사진, 본문 사진) */
    label: string
}

export interface CuriousDoc {
    kind: CuriousKind
    id?: number
    /** 사람이 볼 큐리어스 화면 주소 */
    url: string
    title: string
    /** 봇이 읽을 글 (이미지 주소 목록 포함) */
    text: string
    /** 대표 이미지 주소들 (이미지 읽기 함수가 생기면 그쪽으로 넘긴다) */
    images: CuriousImage[]
}

export type CuriousFailCode = 'not_public' | 'blocked' | 'timeout' | 'empty' | 'bad_url'
export type CuriousResult = { ok: true; doc: CuriousDoc } | { ok: false; reason: string; code: CuriousFailCode }

/** 공개 창구 하나를 불러 JSON 으로. 못 받으면 status 와 함께 null */
export type CuriousGetJson = (apiUrl: string) => Promise<{ ok: true; data: unknown } | { ok: false; status?: number; timeout?: boolean }>

export interface CuriousReadOptions {
    /** 기본: 전역 fetch (주소 고정, 튕김 안 따라감, 크기 한도). 서버는 fetchPageSafely 를 넣는다 */
    getJson?: CuriousGetJson
    timeoutMs?: number
    maxBytes?: number
    /** 글자 수 한도 */
    maxChars?: number
}

/* ────────────────────────── 주소 가르기 ────────────────────────── */

export function isCuriousHost(hostname: string): boolean {
    const h = String(hostname ?? '').toLowerCase().replace(/\.$/, '')
    return h === 'curious-500.com' || h === 'www.curious-500.com' || h === 'm.curious-500.com'
}

const ID = /^\d{1,9}$/

/** 큐리어스 화면 주소 → 읽을 대상. 큐리어스 주소가 아니거나 모르는 화면이면 null (일반 웹 읽기로) */
export function parseCuriousUrl(raw: string): CuriousTarget | null {
    let u: URL
    try { u = new URL(String(raw ?? '').trim()) } catch { return null }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    if (u.username || u.password) return null
    if (!isCuriousHost(u.hostname)) return null
    const p = u.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s) } catch { return s } })
    const parts = p[0] === 'v2' ? p.slice(1) : p
    const num = (s?: string) => (s && ID.test(s) ? Number(s) : null)
    const [a, b, c] = parts
    if (a === 'membership') {
        // /membership/explore/95, /membership/95, /membership/joined/95
        const id = num(c) ?? num(b)
        if (id && (b === 'explore' || b === 'joined' || num(b))) return { kind: 'membership', id }
        return null
    }
    if (a === 'study' && num(b)) return { kind: 'study', id: num(b)! }
    if ((a === 'creator' || a === 'leader') && num(b)) return { kind: 'leader', id: num(b)! }
    if ((a === 'digital-content' || a === 'book') && num(b)) return { kind: 'digital-content', id: num(b)! }
    if (a === 'community') {
        if (b === 'post' && num(c)) return { kind: 'post', id: num(c)! }
        if (!b) return { kind: 'community' }
        return null
    }
    if (a === 'post' && num(b)) return { kind: 'post', id: num(b)! }
    return null
}

const KIND_ALIAS: Record<string, CuriousKind> = {
    membership: 'membership', 멤버십: 'membership',
    study: 'study', class: 'study', lecture: 'study', 어울림: 'study', 강의: 'study', 클래스: 'study',
    leader: 'leader', creator: 'leader', 리더: 'leader', 강사: 'leader',
    'digital-content': 'digital-content', book: 'digital-content', ebook: 'digital-content', 디지털콘텐츠: 'digital-content', 전자책: 'digital-content',
    community: 'community', 커뮤니티: 'community',
    post: 'post', 게시글: 'post', 글: 'post',
}

/** CLI 용: 「주소」 또는 「종류 번호」(예: membership 95, study 4962, community) */
export function parseCuriousInput(first: string, second?: string): CuriousTarget | null {
    const f = String(first ?? '').trim()
    if (/^https?:\/\//i.test(f) || /^(www\.)?curious-500\.com\//i.test(f)) return parseCuriousUrl(/^https?:\/\//i.test(f) ? f : `https://${f}`)
    const kind = KIND_ALIAS[f.toLowerCase()]
    if (!kind) return null
    if (kind === 'community') return { kind }
    const id = String(second ?? '').trim()
    return ID.test(id) ? { kind, id: Number(id) } : null
}

/** 대상 → 사람이 볼 큐리어스 화면 주소 */
export function curiousPageUrl(t: CuriousTarget): string {
    switch (t.kind) {
        case 'membership': return `${CURIOUS_ORIGIN}/v2/membership/explore/${t.id}`
        case 'study': return `${CURIOUS_ORIGIN}/v2/study/${t.id}`
        case 'leader': return `${CURIOUS_ORIGIN}/v2/creator/${t.id}`
        case 'digital-content': return `${CURIOUS_ORIGIN}/v2/digital-content/${t.id}`
        case 'post': return `${CURIOUS_ORIGIN}/v2/community/post/${t.id}`
        default: return `${CURIOUS_ORIGIN}/v2/community`
    }
}

/* ────────────────────────── 글 다듬기 ────────────────────────── */

const ENT: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" }

/** 큐리어스 본문 HTML(에디터 글) → 읽는 글 */
export function curiousHtmlToText(html: unknown): string {
    // script, style 등은 앞으로만 훑어 지우고, 태그는 다음 < 까지만 본다 (보안 재검토 PR #53: 둘 다 선형)
    return stripHtmlBlocks(String(html ?? '').slice(0, 300 * 1024))
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^<>]*>/g, '')
        .replace(/&#(\d{1,6});/g, (_, n) => { try { return String.fromCodePoint(Number(n)) } catch { return ' ' } })
        .replace(/&[a-z]+;|&#39;/gi, m => ENT[m.toLowerCase()] ?? ' ')
        .replace(/[ \t\u00a0]{2,}/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/\n{2,}(?=- )/g, '\n')
        .trim()
}

/** 본문 HTML 안의 사진 주소 (http, https 만) */
export function imagesInHtml(html: unknown, max = 5): string[] {
    const out: string[] = []
    for (const m of String(html ?? '').matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
        const src = m[1].replace(/&amp;/g, '&')
        if (/^https?:\/\//i.test(src) && !out.includes(src)) out.push(src)
        if (out.length >= max) break
    }
    return out
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const arr = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const won = (v: unknown): string => {
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n)) return ''
    return n === 0 ? '무료' : `${n.toLocaleString('ko-KR')}원`
}
/** 큐리어스 시각(대부분 한국 시각, 꼬리표 없음) → 2026-10-05 20:00 */
const when = (v: unknown): string => {
    const s = str(v)
    const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/)
    return m ? (m[2] ? `${m[1]} ${m[2]}` : m[1]) : ''
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)
const isUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\//i.test(v) && !/\/undefined\/?$/.test(v)

/** 응답이 { result, data } 로 싸여 있으면 data 를 꺼낸다 */
export function unwrap(v: unknown): unknown {
    const o = obj(v)
    return 'data' in o && ('result' in o || 'result_code' in o || 'message' in o) ? o.data : v
}

function pushImage(list: CuriousImage[], url: unknown, label: string) {
    if (!isUrl(url)) return
    const u = String(url)
    if (list.some(i => i.url === u)) return
    list.push({ url: u, label })
}

function imageSection(images: CuriousImage[]): string {
    if (images.length === 0) return ''
    return `[이미지]\n${images.map(i => `- ${i.label}: ${i.url}`).join('\n')}`
}

function joinBlocks(blocks: (string | false | null | undefined)[]): string {
    return blocks.filter((b): b is string => typeof b === 'string' && b.trim().length > 0).join('\n\n')
}

const JOIN_LABEL: Record<string, string> = { immediate: '바로 가입', approval: '승인 후 가입' }
const METHOD_LABEL: Record<string, string> = { lecture: '강의', challenge: '챌린지', group: '모임' }
const STATUS_LABEL: Record<string, string> = { recruiting: '모집 중', 'in-progress': '진행 중', done: '끝남' }

/* ────────────────────────── 종류별 글 만들기 (순수 함수) ────────────────────────── */

export function formatMembership(id: number, raw: { detail: unknown; prices?: unknown; schedules?: unknown; categories?: unknown }): CuriousDoc | null {
    const d = obj(unwrap(raw.detail))
    const m = obj(d.membership)
    const title = str(m.title)
    if (!title) return null
    const creator = obj(d.creator)
    const images: CuriousImage[] = []
    pushImage(images, m.banner, '멤버십 대표 사진')
    pushImage(images, m.thumbnailUrl, '멤버십 작은 사진')
    imagesInHtml(m.intro, 4).forEach(u => pushImage(images, u, '소개 본문 사진'))
    pushImage(images, creator.profileImage, '리더 사진')

    const priceList = arr(obj(unwrap(raw.prices)).priceList)
    const priceLine = priceList.length > 0
        ? priceList.map(p => `${Number(p.durationMonths) === 1 ? '월' : `${p.durationMonths}개월`} ${won(p.price)}`).join(', ')
        : won(obj(d.price).finalPrice) ? `월 ${won(obj(d.price).finalPrice)}` : ''
    const benefits = arr(m.benefitList).map(b => `- ${str(b.title)}${str(b.description) ? `: ${str(b.description)}` : ''}`).filter(l => l.length > 2)
    const schedules = arr(obj(unwrap(raw.schedules)).scheduleList).slice(0, 10)
        .map(s => `- ${when(s.startAt)} ${str(s.title)}${str(s.description) ? `: ${str(s.description)}` : ''}`)
    const boards = arr(obj(unwrap(raw.categories)).categoryList)
        .map(c => `- ${str(c.displayName)}${c.visibility === 'member_only' ? ' (멤버 전용)' : ''}${str(c.description) ? `: ${str(c.description)}` : ''}`)
    const careers = arr<string>(creator.careerList).map(c => `- ${str(c)}`).filter(l => l.length > 2)
    const sns = arr(creator.snsList).filter(s => isUrl(s.url)).map(s => `${str(s.type)} ${str(s.url)}`)
    const url = curiousPageUrl({ kind: 'membership', id })
    const head = [
        `[큐리어스 멤버십] ${title}`,
        str(creator.nickname) ? `리더: ${str(creator.nickname)}` : '',
        str(m.description) ? `한 줄 소개: ${str(m.description)}` : '',
        JOIN_LABEL[str(m.joinType)] ? `가입 방식: ${JOIN_LABEL[str(m.joinType)]}` : '',
        m.isMemberCountVisible !== false && typeof m.memberCount === 'number' ? `멤버: ${m.memberCount}명` : '',
        priceLine ? `가격: ${priceLine}` : '',
        `주소: ${url}`,
    ].filter(Boolean).join('\n')
    const text = joinBlocks([
        head,
        curiousHtmlToText(m.intro) && `[소개]\n${curiousHtmlToText(m.intro)}`,
        benefits.length > 0 && `[혜택]\n${benefits.join('\n')}`,
        schedules.length > 0 && `[일정]\n${schedules.join('\n')}`,
        boards.length > 0 && `[게시판] (글 내용은 멤버만 볼 수 있어요)\n${boards.join('\n')}`,
        (str(creator.intro) || careers.length > 0) && `[리더 소개] ${str(creator.nickname)}\n${str(creator.intro)}${careers.length ? `\n경력:\n${careers.join('\n')}` : ''}${sns.length ? `\nSNS: ${sns.join(', ')}` : ''}`,
        imageSection(images),
    ])
    return { kind: 'membership', id, url, title: `${title} | 큐리어스 멤버십`, text, images }
}

export function formatStudy(id: number, raw: { page: unknown; reviews?: unknown }): CuriousDoc | null {
    const d = obj(unwrap(raw.page))
    const s = obj(d.study)
    const title = str(s.title)
    if (!title) return null
    const w = obj(d.writer)
    const pg = obj(d.page)
    const images: CuriousImage[] = []
    pushImage(images, s.cover_image, '어울림 대표 사진')
    pushImage(images, pg.detail_page_image, '상세 사진')
    imagesInHtml(pg.intro, 4).forEach(u => pushImage(images, u, '소개 본문 사진'))
    pushImage(images, w.profile_image, '리더 사진')

    const cats = arr(d.category).map(c => str(c.category)).filter(Boolean)
    const sched = arr(d.schedule).slice(0, 20).map(x => `- ${str(x.date)} ${str(x.start_time).slice(0, 5)}${str(x.end_time) ? `~${str(x.end_time).slice(0, 5)}` : ''}${str(x.content) ? `: ${str(x.content)}` : ''}`)
    const qna = arr(d.qna).slice(0, 10).map(q => `- 질문: ${clip(str(q.comment), 300)}${str(q.answer) ? `\n  답: ${clip(str(q.answer), 300)}` : ''}`).filter(l => l.length > 8)
    const reviews = arr(raw.reviews).slice(0, 10).map(r => `- ${str(r.nickname) || '수강생'} (${r.rate ?? '?'}/10): ${clip(str(r.comment), 500)}`)
    const sns = [w.instagram_url, w.youtube_url].filter(isUrl).map(String)
    const url = curiousPageUrl({ kind: 'study', id })
    const method = METHOD_LABEL[str(s.method)] ?? str(s.method)
    const head = [
        `[큐리어스 어울림] ${title}`,
        method ? `종류: ${method}${s.is_offline === true ? ', 오프라인' : s.is_offline === false ? ', 온라인' : ''}` : '',
        STATUS_LABEL[str(s.status)] ? `상태: ${STATUS_LABEL[str(s.status)]}` : '',
        won(s.price) ? `가격: ${won(s.price)}` : '',
        cats.length ? `분야: ${cats.join(', ')}` : '',
        str(w.nickname) ? `리더: ${str(w.nickname)}` : '',
        `주소: ${url}`,
    ].filter(Boolean).join('\n')
    const intro = curiousHtmlToText(pg.intro)
    const content = curiousHtmlToText(pg.content)
    const rec = curiousHtmlToText(pg.recommended)
    const text = joinBlocks([
        head,
        intro && `[소개]\n${intro}`,
        content && `[내용]\n${content}`,
        rec && `[이런 분께 추천]\n${rec}`,
        sched.length > 0 && `[일정]\n${sched.join('\n')}`,
        qna.length > 0 && `[질문]\n${qna.join('\n')}`,
        reviews.length > 0 && `[후기]\n${reviews.join('\n')}`,
        str(w.intro) && `[리더 소개] ${str(w.nickname)}\n${str(w.intro)}${sns.length ? `\nSNS: ${sns.join(', ')}` : ''}`,
        imageSection(images),
    ])
    return { kind: 'study', id, url, title: `${title} | 큐리어스`, text, images }
}

export function formatLeader(id: number, raw: { leader: unknown; records?: unknown; reviews?: unknown; page?: unknown }): CuriousDoc | null {
    const l = obj(unwrap(raw.leader))
    const name = str(l.nickname)
    if (!name) return null
    const images: CuriousImage[] = []
    pushImage(images, l.profileImage, '리더 사진')
    const records = arr(obj(unwrap(raw.records)).workingRecordList).map(r => `- ${str(r.content)}`).filter(x => x.length > 2)
    const blocks = arr(obj(unwrap(raw.page)).blocks).filter(b => b.isVisible !== false)
    const blockLines: string[] = []
    for (const b of blocks) {
        const t = str(b.title)
        const link = str(b.linkUrl)
        if (b.blockType === 'text' && (str(b.content) || t)) blockLines.push(`- ${t}${str(b.content) ? `: ${curiousHtmlToText(b.content)}` : ''}`)
        else if (b.blockType === 'link' && t) {
            // 오픈채팅 주소는 넣지 않는다 (입장 안내는 큐리어스 화면에서)
            const safe = link && !/open\.kakao\.com/i.test(link) ? ` (${link.startsWith('/') ? CURIOUS_ORIGIN + link : link})` : ''
            blockLines.push(`- ${t}${safe}`)
        }
        if (blockLines.length >= 15) break
        if (b.blockType === 'link') pushImage(images, b.imageUrl, `${t || '링크'} 사진`)
    }
    const reviews = arr(obj(raw.reviews).study_leader_review_list).slice(0, 10)
        .map(r => `- ${str(r.reviewer_nickname) || '수강생'} (${r.rate ?? '?'}/10${str(r.study_title) ? `, ${str(r.study_title)}` : ''}): ${clip(str(r.comment), 500)}`)
    const sns = [l.instagramUrl, l.youtubeUrl, l.naverBlogUrl].filter(isUrl).map(String)
    const url = curiousPageUrl({ kind: 'leader', id })
    const head = [
        `[큐리어스 리더] ${name}`,
        typeof l.followerCount === 'number' ? `팔로워: ${l.followerCount.toLocaleString('ko-KR')}명` : '',
        sns.length ? `SNS: ${sns.join(', ')}` : '',
        `주소: ${url}`,
    ].filter(Boolean).join('\n')
    const text = joinBlocks([
        head,
        str(l.intro) && `[소개]\n${str(l.intro)}`,
        records.length > 0 && `[경력]\n${records.join('\n')}`,
        blockLines.length > 0 && `[리더 페이지]\n${blockLines.join('\n')}`,
        reviews.length > 0 && `[후기]\n${reviews.join('\n')}`,
        imageSection(images.slice(0, 6)),
    ])
    return { kind: 'leader', id, url, title: `${name} | 큐리어스 리더`, text, images: images.slice(0, 6) }
}

export function formatDigitalContent(id: number, raw: { book: unknown }): CuriousDoc | null {
    const b = obj(unwrap(raw.book))
    const title = str(b.title)
    if (!title) return null
    const images: CuriousImage[] = []
    pushImage(images, b.coverImage, '표지')
    arr<string>(b.additionalImageList).slice(0, 4).forEach(u => pushImage(images, u, '소개 사진'))
    const url = curiousPageUrl({ kind: 'digital-content', id })
    const cats = arr<string>(b.categoryList).map(str).filter(Boolean)
    const head = [
        `[큐리어스 디지털콘텐츠] ${title}`,
        str(b.subTitle) ? `부제: ${str(b.subTitle)}` : '',
        won(b.price) ? `가격: ${won(b.price)}` : '',
        typeof b.pageCount === 'number' ? `분량: ${b.pageCount}쪽` : '',
        cats.length ? `분야: ${cats.join(', ')}` : '',
        `주소: ${url}`,
    ].filter(Boolean).join('\n')
    // 파일 주소(fileUrl, fileName)는 넣지 않는다
    const text = joinBlocks([head, str(b.intro) && `[소개]\n${curiousHtmlToText(b.intro)}`, imageSection(images)])
    return { kind: 'digital-content', id, url, title: `${title} | 큐리어스 디지털콘텐츠`, text, images }
}

export function formatPost(id: number, raw: { post: unknown; comments?: unknown; categories?: unknown }): CuriousDoc | null {
    const p = obj(unwrap(raw.post))
    const title = str(p.title)
    if (!title) return null
    const w = obj(p.writerInfo)
    const catName = categoryName(raw.categories, p.postCategoryNumber)
    const images: CuriousImage[] = []
    imagesInHtml(p.content, 4).forEach(u => pushImage(images, u, '글 사진'))
    const comments: string[] = []
    for (const c of arr(obj(raw.comments).postCommentList).slice(0, 20)) {
        comments.push(`- ${str(obj(c.writerInfo).writerNickname) || '회원'}: ${clip(curiousHtmlToText(c.content), 300)}`)
        for (const r of arr(c.commentReplyList).slice(0, 5)) comments.push(`  - ${str(obj(r.writerInfo).writerNickname) || '회원'}: ${clip(curiousHtmlToText(r.content), 300)}`)
    }
    const url = curiousPageUrl({ kind: 'post', id })
    const head = [
        `[큐리어스 커뮤니티 글] ${title}`,
        catName ? `게시판: ${catName}` : '',
        str(w.writerNickname) ? `글쓴이: ${str(w.writerNickname)}` : '',
        when(p.createdAt) ? `올린 날: ${when(p.createdAt)}` : '',
        `좋아요 ${p.likeCount ?? 0}, 댓글 ${p.commentCount ?? 0}, 조회 ${p.viewCount ?? 0}`,
        `주소: ${url}`,
    ].filter(Boolean).join('\n')
    const text = joinBlocks([head, `[본문]\n${curiousHtmlToText(p.content) || '(글 없이 사진만 있어요)'}`, comments.length > 0 && `[댓글]\n${comments.join('\n')}`, imageSection(images)])
    return { kind: 'post', id, url, title: `${title} | 큐리어스 커뮤니티`, text, images }
}

function categoryName(categories: unknown, n: unknown): string {
    const list = arr(unwrap(categories))
    const hit = list.find(c => Number(c.postCategoryId) === Number(n))
    return hit ? str(hit.name) : ''
}

export function formatCommunity(raw: { categories?: unknown; recent?: unknown; popular?: unknown; details?: unknown[] }): CuriousDoc | null {
    const cats = arr(unwrap(raw.categories))
    const recent = arr(obj(unwrap(raw.recent)).postList)
    const popular = arr(obj(unwrap(raw.popular)).popularPostList)
    if (recent.length === 0 && popular.length === 0 && cats.length === 0) return null
    const details = new Map<number, Record<string, unknown>>()
    for (const d of raw.details ?? []) { const o = obj(unwrap(d)); if (typeof o.id === 'number') details.set(o.id, o) }
    const line = (p: Record<string, unknown>) => {
        const w = obj(p.writerInfo)
        const cat = categoryName(raw.categories, p.postCategoryNumber)
        const body = curiousHtmlToText(p.content ?? details.get(Number(p.id))?.content)
        const counts = [typeof p.likeCount === 'number' ? `좋아요 ${p.likeCount}` : '', typeof p.commentCount === 'number' ? `댓글 ${p.commentCount}` : '']
        return `- ${str(p.title)} (${[cat, str(w.writerNickname), when(p.createdAt).slice(0, 10), ...counts].filter(Boolean).join(', ')})\n  ${curiousPageUrl({ kind: 'post', id: Number(p.id) })}${body ? `\n  ${clip(body.replace(/\s+/g, ' '), 300)}` : ''}`
    }
    const images: CuriousImage[] = []
    for (const p of popular.slice(0, 5)) imagesInHtml(p.content, 1).forEach(u => pushImage(images, u, `${str(p.title)} 사진`))
    const url = curiousPageUrl({ kind: 'community' })
    const text = joinBlocks([
        `[큐리어스 커뮤니티]\n중장년이 배우고 나누는 큐리어스 회원들의 공개 게시판이에요.\n주소: ${url}`,
        cats.length > 0 && `[게시판]\n${cats.map(c => `- ${str(c.name)}${str(c.description) ? `: ${str(c.description)}` : ''}`).join('\n')}`,
        popular.length > 0 && `[인기 글]\n${popular.slice(0, 5).map(line).join('\n')}`,
        recent.length > 0 && `[최근 글]\n${recent.slice(0, 15).map(line).join('\n')}`,
        imageSection(images),
    ])
    return { kind: 'community', url, title: '큐리어스 커뮤니티', text, images }
}

/* ────────────────────────── 실제로 읽기 ────────────────────────── */

/** 기본 불러오기: 주소는 CURIOUS_API 로 시작하는 것만, 튕기지 않고, 크기와 시간 한도 */
export function defaultGetJson(o: { timeoutMs: number; maxBytes: number }): CuriousGetJson {
    return async (apiUrl: string) => {
        if (!apiUrl.startsWith(`${CURIOUS_API}/`)) return { ok: false }
        let res: Response
        try {
            res = await fetch(apiUrl, {
                redirect: 'error',
                signal: AbortSignal.timeout(o.timeoutMs),
                headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; CuriAI-Bot/1.0; +https://www.curi-ai.com)' },
            })
        } catch (e) {
            return { ok: false, timeout: e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError') }
        }
        if (!res.ok) return { ok: false, status: res.status }
        const body = await res.text().catch(() => '')
        if (!body || body.length > o.maxBytes) return { ok: false }
        try { return { ok: true, data: JSON.parse(body) } } catch { return { ok: false } }
    }
}

const NOT_FOUND = '큐리어스에서 그 화면을 찾지 못했어요(지워졌거나 공개되지 않은 화면일 수 있어요)'
const NO_ANSWER = '큐리어스가 지금 답하지 않아요. 잠시 뒤 다시 시도하거나 글을 붙여넣어 주세요'
const SLOW = '큐리어스가 너무 느려서 멈췄어요. 다시 시도해 주세요'

/** 큐리어스 주소나 대상 하나를 읽는다. 절대 던지지 않는다 */
export async function readCurious(input: string | CuriousTarget, opts: CuriousReadOptions = {}): Promise<CuriousResult> {
    const t = typeof input === 'string' ? parseCuriousUrl(input) : input
    if (!t || (t.kind !== 'community' && !(typeof t.id === 'number' && t.id > 0 && Number.isInteger(t.id)))) {
        return { ok: false, reason: '큐리어스 주소 모양을 알아보지 못했어요', code: 'bad_url' }
    }
    const timeoutMs = opts.timeoutMs ?? 8_000
    const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024
    const get = opts.getJson ?? defaultGetJson({ timeoutMs, maxBytes })
    const api = (path: string) => `${CURIOUS_API}${path}`
    type Got = Awaited<ReturnType<CuriousGetJson>>
    const data = (g: Got) => (g.ok ? g.data : undefined)
    const failOf = (g: Got): CuriousResult => g.ok
        ? { ok: false, reason: '큐리어스 화면에서 읽을 글을 못 찾았어요', code: 'empty' }
        : g.status === 404 || g.status === 422 || g.status === 403 || g.status === 401
            ? { ok: false, reason: NOT_FOUND, code: 'not_public' }
            : g.timeout ? { ok: false, reason: SLOW, code: 'timeout' } : { ok: false, reason: NO_ANSWER, code: 'blocked' }

    try {
        let doc: CuriousDoc | null = null
        let main: Got
        const id = t.id as number
        switch (t.kind) {
            case 'membership': {
                const [detail, prices, schedules, categories] = await Promise.all([
                    get(api(`/membership/${id}`)), get(api(`/membership/${id}/price-list`)),
                    get(api(`/membership/${id}/schedules`)), get(api(`/membership/${id}/categories`)),
                ])
                main = detail
                if (detail.ok) doc = formatMembership(id, { detail: detail.data, prices: data(prices), schedules: data(schedules), categories: data(categories) })
                break
            }
            case 'study': {
                const [page, reviews] = await Promise.all([
                    get(api(`/study-pages/${id}`)), get(api(`/studies/${id}/reviews?sort=created_at&order_by=desc`)),
                ])
                main = page
                if (page.ok) doc = formatStudy(id, { page: page.data, reviews: data(reviews) })
                break
            }
            case 'leader': {
                const [leader, records, reviews, page] = await Promise.all([
                    get(api(`/leaders/${id}`)), get(api(`/leaders/${id}/working-records`)),
                    get(api(`/leaders/${id}/study-reviews`)), get(api(`/creators/${id}/page`)),
                ])
                main = leader
                if (leader.ok) doc = formatLeader(id, { leader: leader.data, records: data(records), reviews: data(reviews), page: data(page) })
                break
            }
            case 'digital-content': {
                main = await get(api(`/digital-content/book/${id}`))
                if (main.ok) doc = formatDigitalContent(id, { book: main.data })
                break
            }
            case 'post': {
                const [post, comments, categories] = await Promise.all([
                    get(api(`/posts/${id}`)), get(api(`/posts/${id}/comments`)), get(api('/posts/categories')),
                ])
                main = post
                if (post.ok) doc = formatPost(id, { post: post.data, comments: data(comments), categories: data(categories) })
                break
            }
            default: {
                const [categories, recent, popular] = await Promise.all([
                    get(api('/posts/categories')), get(api('/posts?category_number=0&sort=created_at&page=1&size=15')), get(api('/posts/popular')),
                ])
                main = recent.ok ? recent : popular
                // 최근 글 목록에는 본문이 없어서 앞 5개만 글을 더 불러 앞부분을 붙인다
                const ids = arr(obj(unwrap(data(recent))).postList).slice(0, 5).map(p => Number(p.id)).filter(n => ID.test(String(n)))
                const details = (await Promise.all(ids.map(n => get(api(`/posts/${n}`))))).map(data).filter(Boolean)
                if (recent.ok || popular.ok) doc = formatCommunity({ categories: data(categories), recent: data(recent), popular: data(popular), details })
            }
        }
        if (!doc) return failOf(main)
        const maxChars = opts.maxChars ?? 100_000
        return { ok: true, doc: { ...doc, text: doc.text.slice(0, maxChars) } }
    } catch {
        return { ok: false, reason: NO_ANSWER, code: 'blocked' }
    }
}
