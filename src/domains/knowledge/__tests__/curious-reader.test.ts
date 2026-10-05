// 큐리어스 읽기 (1005): 주소 가르기, 종류별 글 만들기, 공개 창구 부르기, 링크 읽기 연결.
// 인터넷에 나가지 않는다: 큐리어스 공개 창구 응답을 실제 모양 그대로 줄여 가짜로 끼운다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '13.124.1.1', family: 4 }]) }))

import {
    parseCuriousUrl, parseCuriousInput, curiousPageUrl, readCurious, curiousHtmlToText, imagesInHtml,
    formatMembership, formatStudy, formatLeader, formatDigitalContent, formatPost, formatCommunity, CURIOUS_API,
    type CuriousGetJson,
} from '../curious-reader'
import { classifyUrl, readUrl, cacheClear } from '@/domains/os/readers'
import { classifySnsLink, BLOG_POST_PLATFORMS } from '@/domains/os/sns-link'
import { linkLabelOf, enoughText } from '@/domains/os/link-rules'
import { snsLabelOf } from '@/domains/os/sns-capture'

const IMG = 'https://d1kz3wll5f1aue.cloudfront.net/images'

const MEMBERSHIP = {
    membership: {
        id: 95, banner: `${IMG}/banner.png`, thumbnailUrl: `${IMG}/thumb.png`, title: '열정진의 생존력 멤버십🔥',
        joinType: 'immediate', memberCount: 15, isMemberCountVisible: true,
        description: '큐리어스 대표가 직접 실행하고 얻은 레슨런과 자료를 공유합니다',
        intro: `<p><strong>신청하면 바로 볼 수 있는 자료모음</strong></p><ul><li><p>미니강의 다시보기</p></li><li><p>라이브 다시보기</p></li></ul><p>격주 수요일 저녁 8시에 라이브로 만납니다.<img src="${IMG}/intro1.png"></p>`,
        benefitList: [{ title: '온라인 라이브 월 2회', description: 'Zoom 진행, 녹화본 제공', sortOrder: 0 }],
        isPublic: true,
    },
    creator: { id: 7, nickname: '열정진', profileImage: `${IMG}/profile.png`, intro: '미션드리븐 대표 열정진입니다.', careerList: ['현) 주식회사 미션드리븐 대표'], snsList: [{ type: 'instagram', url: 'https://www.instagram.com/jinsoo_world/' }] },
    price: { finalPrice: 52500 },
}
const PRICES = { result: 'success', message: 'ok', data: { priceList: [{ id: 1, durationMonths: 1, price: 52500 }, { id: 2, durationMonths: 6, price: 261450 }] } }
const SCHEDULES = { result: 'success', message: 'ok', data: { scheduleList: [{ title: '세 번째 라이브', startAt: '2026-10-07T20:00:00', description: '정부지원사업 공고문 읽기' }] } }
const CATEGORIES = { result: 'success', message: 'ok', data: { categoryList: [{ displayName: '공지사항', visibility: 'member_only', description: null }] } }

const STUDY_PAGE = {
    result: 'success', result_code: 'S0000', message: 'ok',
    data: {
        study: { id: 4962, title: '체크받고 바로 고치는 보컬클래스', method: 'lecture', status: 'recruiting', price: 129000, is_offline: false, cover_image: `${IMG}/cover.png` },
        writer: { id: 5814, nickname: '다이나믹보컬쌤', profile_image: `${IMG}/w.png`, intro: '마음으로 노래하는 보컬 다보입니다', instagram_url: 'https://www.instagram.com/vocal/' },
        page: { intro: '<p>발성연습부터 레코딩까지 보컬 수업 현장</p>', content: '', recommended: '', detail_page_image: '' },
        schedule: [{ date: '2026-10-11', start_time: '21:00:00', end_time: '22:00:00', content: '현재 목소리 흐름 파악' }],
        option: [{ kakao_open_chat_url: 'https://open.kakao.com/o/SECRET', kakao_open_chat_password: '입장코드 1004', price: 129000 }],
        category: [{ category: '취미힐링' }],
        qna: [{ comment: '1:1 레슨인가요?', writer_id: 19049 }],
    },
}
const STUDY_REVIEWS = [{ id: 1, nickname: '트루북스', rate: 10, comment: '강의가 깔끔하고 알아듣기 쉬웠어요' }]

const BOOK = { result: 'success', message: 'ok', data: { bookId: 172, title: '디지털 & AI도구 50개', subTitle: '중장년 도구 모음', price: 0, pageCount: 54, coverImage: `${IMG}/book.png`, categoryList: ['수익화'], intro: '디지털 능력을 업그레이드하자!', fileUrl: 'https://d1kz3wll5f1aue.cloudfront.net/files/books/PAID_FILE', fileName: 'https://d1kz3wll5f1aue.cloudfront.net/files/books/PAID_FILE' } }

const LEADER = { result: 'success', message: 'ok', data: { id: 7, nickname: '열정진', profileImage: `${IMG}/profile.png`, intro: '중장년 강의 놀이터 큐리어스 대표입니다', instagramUrl: 'https://www.instagram.com/jinsoo_world/', naverBlogUrl: '', followerCount: 9002 } }
const RECORDS = { result: 'success', message: 'ok', data: { workingRecordList: [{ id: 1, content: '전) 플랫폼 사업본부 팀장' }] } }
const LEADER_REVIEWS = { study_leader_review_list: [{ reviewer_nickname: 'dorothy65', rate: 10, study_title: '무료특강', comment: '알아듣기 쉬웠어요', reviewer_id: 29155 }] }
const CREATOR_PAGE = { result: 'success', message: 'ok', data: { blocks: [
    { blockType: 'link', isVisible: true, title: '생존력 멤버십', linkUrl: 'https://curious-500.com/v2/membership/explore/95', imageUrl: `${IMG}/block.png` },
    { blockType: 'link', isVisible: true, title: '오픈채팅방', linkUrl: 'https://open.kakao.com/o/gRrA1C5e' },
    { blockType: 'link', isVisible: false, title: '숨긴 블록', linkUrl: '/study/1' },
] } }

const POST = { result: 'success', message: 'ok', data: { id: 2742, title: '눈이 부시게 위를 쳐다보세요', content: `<p><img src="${IMG}/sky.jpg">눈이 부시게</p><p>위를 쳐다보는 루틴</p>`, createdAt: '2026-09-27T21:57:02', writerInfo: { writerId: 491, writerNickname: '고운가루' }, likeCount: 3, commentCount: 1, viewCount: 26, postCategoryNumber: 7 } }
const COMMENTS = { postCommentList: [{ content: '하늘이 궁금해요', writerInfo: { writerNickname: '마음공감코치' }, commentReplyList: [{ content: '느낌은 다를 것 같아요', writerInfo: { writerNickname: '고운가루' } }] }] }
const POST_CATEGORIES = { result: 'success', message: 'ok', data: [{ postCategoryId: 7, name: '성장일기', description: '성장 과정을 기록하는 공간' }] }
const RECENT = { postList: [{ id: 2783, title: '강사에게 듣기 좋은 칭찬', createdAt: '2026-10-05T07:10:12', writerInfo: { writerNickname: '더블와이파파' }, likeCount: 0, commentCount: 0, postCategoryNumber: 7 }] }
const POPULAR = { result: 'success', message: 'ok', data: { popularPostList: [{ id: 2742, title: '눈이 부시게 위를 쳐다보세요', content: POST.data.content, createdAt: '2026-09-27T21:57:02', writerInfo: { writerNickname: '고운가루' }, postCategoryNumber: 7 }] } }
const RECENT_DETAIL = { result: 'success', message: 'ok', data: { id: 2783, title: '강사에게 듣기 좋은 칭찬', content: '<p>수업이 끝나고 들은 말이 오래 남았습니다.</p>' } }

const API: Record<string, unknown> = {
    '/membership/95': MEMBERSHIP, '/membership/95/price-list': PRICES, '/membership/95/schedules': SCHEDULES, '/membership/95/categories': CATEGORIES,
    '/study-pages/4962': STUDY_PAGE, '/studies/4962/reviews?sort=created_at&order_by=desc': STUDY_REVIEWS,
    '/digital-content/book/172': BOOK,
    '/leaders/7': LEADER, '/leaders/7/working-records': RECORDS, '/leaders/7/study-reviews': LEADER_REVIEWS, '/creators/7/page': CREATOR_PAGE,
    '/posts/2742': POST, '/posts/2742/comments': COMMENTS, '/posts/categories': POST_CATEGORIES,
    '/posts?category_number=0&sort=created_at&page=1&size=15': RECENT, '/posts/popular': POPULAR, '/posts/2783': RECENT_DETAIL,
}

function fakeGet(asked: string[]): CuriousGetJson {
    return async (url) => {
        asked.push(url)
        const key = url.slice(CURIOUS_API.length)
        return key in API ? { ok: true, data: API[key] } : { ok: false, status: 404 }
    }
}

describe('parseCuriousUrl', () => {
    it('아는 화면 주소를 종류와 번호로 가른다', () => {
        expect(parseCuriousUrl('https://curious-500.com/v2/membership/explore/95')).toEqual({ kind: 'membership', id: 95 })
        expect(parseCuriousUrl('https://www.curious-500.com/v2/study/4962?leader_code=x')).toEqual({ kind: 'study', id: 4962 })
        expect(parseCuriousUrl('https://curious-500.com/study/4173')).toEqual({ kind: 'study', id: 4173 })
        expect(parseCuriousUrl('https://curious-500.com/v2/creator/7')).toEqual({ kind: 'leader', id: 7 })
        expect(parseCuriousUrl('https://curious-500.com/v2/leader/7/participants')).toEqual({ kind: 'leader', id: 7 })
        expect(parseCuriousUrl('https://curious-500.com/book/172')).toEqual({ kind: 'digital-content', id: 172 })
        expect(parseCuriousUrl('https://curious-500.com/v2/digital-content/172')).toEqual({ kind: 'digital-content', id: 172 })
        expect(parseCuriousUrl('https://curious-500.com/v2/community')).toEqual({ kind: 'community' })
        expect(parseCuriousUrl('https://curious-500.com/v2/community/post/2742')).toEqual({ kind: 'post', id: 2742 })
    })
    it('큐리어스가 아니거나 모르는 화면, 이상한 번호는 null (일반 웹 읽기로)', () => {
        expect(parseCuriousUrl('https://curious-500.com.evil.com/v2/study/1')).toBeNull()
        expect(parseCuriousUrl('https://evil.com/v2/study/1')).toBeNull()
        expect(parseCuriousUrl('https://user:pw@curious-500.com/v2/study/1')).toBeNull()
        expect(parseCuriousUrl('https://curious-500.com/v2/home')).toBeNull()
        expect(parseCuriousUrl('https://curious-500.com/v2/study/abc')).toBeNull()
        expect(parseCuriousUrl('https://curious-500.com/v2/study/..%2F..%2Fadmin')).toBeNull()
        expect(parseCuriousUrl('https://curious-500.com/v2/my-page')).toBeNull()
        expect(parseCuriousUrl('ftp://curious-500.com/v2/study/1')).toBeNull()
    })
    it('CLI 입력: 주소 또는 종류 번호', () => {
        expect(parseCuriousInput('membership', '95')).toEqual({ kind: 'membership', id: 95 })
        expect(parseCuriousInput('어울림', '4962')).toEqual({ kind: 'study', id: 4962 })
        expect(parseCuriousInput('community')).toEqual({ kind: 'community' })
        expect(parseCuriousInput('curious-500.com/v2/creator/7')).toEqual({ kind: 'leader', id: 7 })
        expect(parseCuriousInput('study', '12a')).toBeNull()
        expect(parseCuriousInput('foo', '1')).toBeNull()
        expect(curiousPageUrl({ kind: 'study', id: 1 })).toBe('https://curious-500.com/v2/study/1')
    })
})

describe('글 다듬기', () => {
    it('에디터 HTML 을 글로, 사진 주소는 따로', () => {
        expect(curiousHtmlToText('<ul><li><p>하나</p></li><li><p>둘</p></li></ul><p>A&amp;B</p>')).toBe('- 하나\n- 둘\n\nA&B')
        expect(imagesInHtml(`<img src="${IMG}/a.png"><img src="javascript:x"><img src="${IMG}/a.png">`)).toEqual([`${IMG}/a.png`])
    })
})

describe('종류별 글 만들기', () => {
    it('멤버십: 소개, 혜택, 가격, 일정, 게시판 이름, 리더 소개, 대표 이미지', () => {
        const d = formatMembership(95, { detail: MEMBERSHIP, prices: PRICES, schedules: SCHEDULES, categories: CATEGORIES })!
        expect(d.title).toContain('열정진의 생존력 멤버십')
        expect(d.text).toContain('가격: 월 52,500원, 6개월 261,450원')
        expect(d.text).toContain('[혜택]\n- 온라인 라이브 월 2회: Zoom 진행, 녹화본 제공')
        expect(d.text).toContain('- 미니강의 다시보기\n- 라이브 다시보기')
        expect(d.text).toContain('2026-10-07 20:00 세 번째 라이브')
        expect(d.text).toContain('공지사항 (멤버 전용)')
        expect(d.text).toContain('[리더 소개] 열정진')
        expect(d.images.map(i => i.url)).toEqual([`${IMG}/banner.png`, `${IMG}/thumb.png`, `${IMG}/intro1.png`, `${IMG}/profile.png`])
        expect(d.text).toContain(`- 멤버십 대표 사진: ${IMG}/banner.png`)
        expect(enoughText(d.text)).toBe(true)
    })
    it('어울림: 오픈채팅 주소와 입장 코드, 회원 번호는 넣지 않는다', () => {
        const d = formatStudy(4962, { page: STUDY_PAGE, reviews: STUDY_REVIEWS })!
        expect(d.text).toContain('[큐리어스 어울림] 체크받고 바로 고치는 보컬클래스')
        expect(d.text).toContain('종류: 강의, 온라인')
        expect(d.text).toContain('상태: 모집 중')
        expect(d.text).toContain('가격: 129,000원')
        expect(d.text).toContain('2026-10-11 21:00~22:00: 현재 목소리 흐름 파악')
        expect(d.text).toContain('트루북스 (10/10): 강의가 깔끔하고')
        expect(d.text).not.toContain('open.kakao.com')
        expect(d.text).not.toContain('1004')
        expect(d.text).not.toContain('19049')
        expect(d.images[0]).toEqual({ url: `${IMG}/cover.png`, label: '어울림 대표 사진' })
    })
    it('디지털콘텐츠: 파일 주소는 넣지 않는다', () => {
        const d = formatDigitalContent(172, { book: BOOK })!
        expect(d.text).toContain('가격: 무료')
        expect(d.text).toContain('분량: 54쪽')
        expect(d.text).not.toContain('PAID_FILE')
        expect(JSON.stringify(d)).not.toContain('PAID_FILE')
    })
    it('리더: 소개, 경력, 페이지 블록(숨긴 것과 오픈채팅 주소 빼고), 후기', () => {
        const d = formatLeader(7, { leader: LEADER, records: RECORDS, reviews: LEADER_REVIEWS, page: CREATOR_PAGE })!
        expect(d.text).toContain('팔로워: 9,002명')
        expect(d.text).toContain('- 전) 플랫폼 사업본부 팀장')
        expect(d.text).toContain('- 생존력 멤버십 (https://curious-500.com/v2/membership/explore/95)')
        expect(d.text).toContain('- 오픈채팅방')
        expect(d.text).not.toContain('open.kakao.com')
        expect(d.text).not.toContain('숨긴 블록')
        expect(d.text).toContain('dorothy65 (10/10, 무료특강): 알아듣기 쉬웠어요')
        expect(d.text).not.toContain('29155')
    })
    it('게시글과 커뮤니티 첫 화면', () => {
        const p = formatPost(2742, { post: POST, comments: COMMENTS, categories: POST_CATEGORIES })!
        expect(p.text).toContain('게시판: 성장일기')
        expect(p.text).toContain('눈이 부시게\n위를 쳐다보는 루틴')
        expect(p.text).toContain('  - 고운가루: 느낌은 다를 것 같아요')
        const c = formatCommunity({ categories: POST_CATEGORIES, recent: RECENT, popular: POPULAR, details: [RECENT_DETAIL] })!
        expect(c.text).toContain('[인기 글]\n- 눈이 부시게 위를 쳐다보세요 (성장일기, 고운가루, 2026-09-27)')
        expect(c.text).toContain('수업이 끝나고 들은 말이 오래 남았습니다.')
        expect(c.text).toContain('https://curious-500.com/v2/community/post/2783')
    })
    it('응답이 비면 null', () => {
        expect(formatMembership(1, { detail: {} })).toBeNull()
        expect(formatStudy(1, { page: { data: {} } })).toBeNull()
        expect(formatCommunity({})).toBeNull()
    })
})

describe('readCurious', () => {
    it('큐리어스 공개 창구만 부르고 글을 만든다', async () => {
        const asked: string[] = []
        const r = await readCurious('https://curious-500.com/v2/membership/explore/95', { getJson: fakeGet(asked) })
        expect(r.ok).toBe(true)
        expect(asked.every(u => u.startsWith(`${CURIOUS_API}/membership/95`))).toBe(true)
        const c = await readCurious({ kind: 'community' }, { getJson: fakeGet(asked) })
        expect(c.ok && c.doc.text).toContain('[최근 글]')
        expect(asked.every(u => u.startsWith(`${CURIOUS_API}/`))).toBe(true)
    })
    it('없는 화면 = 이유와 붙여넣기 갈래, 느림 = 다시 시도 갈래', async () => {
        const nf = await readCurious('https://curious-500.com/v2/study/99999', { getJson: async () => ({ ok: false, status: 404 }) })
        expect(nf).toMatchObject({ ok: false, code: 'not_public' })
        const slow = await readCurious('https://curious-500.com/v2/study/1', { getJson: async () => ({ ok: false, timeout: true }) })
        expect(slow).toMatchObject({ ok: false, code: 'timeout' })
        const down = await readCurious('https://curious-500.com/v2/study/1', { getJson: async () => ({ ok: false, status: 502 }) })
        expect(down).toMatchObject({ ok: false, code: 'blocked' })
        const bad = await readCurious('https://curious-500.com/v2/home')
        expect(bad).toMatchObject({ ok: false, code: 'bad_url' })
        // 고객 문구: 숫자, 가운뎃점, 긴 대시 없음
        for (const r of [nf, slow, down, bad]) if (!r.ok) expect(r.reason).not.toMatch(/[0-9·—]/)
    })
    it('기본 불러오기는 큐리어스 창구 밖으로 나가지 않는다', async () => {
        const f = vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
        vi.stubGlobal('fetch', f)
        await readCurious({ kind: 'study', id: 5 })
        for (const call of f.mock.calls as unknown as [string, RequestInit][]) {
            expect(String(call[0]).startsWith(`${CURIOUS_API}/`)).toBe(true)
            expect(call[1].redirect).toBe('error')
        }
        vi.unstubAllGlobals()
    })
})

describe('큐리AI 링크 읽기 연결', () => {
    beforeEach(() => {
        cacheClear()
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input instanceof Request ? input.url : input)
            const key = url.startsWith(CURIOUS_API) ? url.slice(CURIOUS_API.length) : null
            if (key && key in API) return new Response(JSON.stringify(API[key]), { status: 200, headers: { 'content-type': 'application/json' } })
            return new Response('{"error":"없음"}', { status: 404, headers: { 'content-type': 'application/json' } })
        }))
    })
    afterEach(() => { vi.unstubAllGlobals() })

    it('길 고르기: 아는 큐리어스 화면은 curious, 나머지는 web', () => {
        expect(classifyUrl('https://curious-500.com/v2/membership/explore/95')).toBe('curious')
        expect(classifyUrl('https://curious-500.com/v2/community')).toBe('curious')
        expect(classifyUrl('https://curious-500.com/v2/home')).toBe('web')
    })
    it('readUrl 이 큐리어스 본문과 이미지 주소를 돌려준다 (안전 검사 거친 요청)', async () => {
        const r = await readUrl('https://curious-500.com/v2/study/4962')
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.source).toBe('curious')
        expect(r.method).toBe('curious')
        expect(r.url).toBe('https://curious-500.com/v2/study/4962')
        expect(r.text).toContain('발성연습부터 레코딩까지')
        expect(r.images?.[0]?.url).toBe(`${IMG}/cover.png`)
        // 첫 장은 사진 설명용 대표 사진으로 넘긴다 (addImageNotes)
        expect(r.image).toBe(`${IMG}/cover.png`)
    })
    it('못 읽으면 이유와 갈래', async () => {
        const r = await readUrl('https://curious-500.com/v2/study/123')
        expect(r).toMatchObject({ ok: false, code: 'not_public' })
    })
    it('내 SNS 연결: 큐리어스 화면 하나 = 그 자리에서 읽고 자료 칸 하나, 붙여넣기 열림', () => {
        const t = classifySnsLink('curious-500.com/v2/creator/7')
        expect(t).toMatchObject({ platform: 'curious', feed: null, single: true, paste: true })
        expect(BLOG_POST_PLATFORMS).toContain('curious')
        expect(linkLabelOf('https://curious-500.com/v2/study/1')).toBe('큐리어스')
        expect(snsLabelOf('https://curious-500.com/v2/study/1')).toBe('큐리어스')
    })
})
