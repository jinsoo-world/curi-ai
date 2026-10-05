import { describe, it, expect } from 'vitest'
import { extractInstagramMedia, extractInstagramPostMedia, extractInstagramOgDate, INSTAGRAM_PUBLIC_MAX } from '../instagram'
import { formatSocialText, formatSocialPost, imageExpiry, extractHashtags } from '../social-post'
import { toSocialRows } from '../../social-store'

// 인스타그램 퍼가기 화면은 contextJSON 을 따옴표로 한 번 더 감싸 둔다
const wrap = (obj: unknown) => `<html><script>window.__x={"contextJSON":${JSON.stringify(JSON.stringify(obj))}}</script></html>`
const oe = (sec: number) => `https://scontent.cdninstagram.com/v/a.jpg?stp=x&oe=${sec.toString(16).toUpperCase()}&_nc=1`
const media = (i: number, extra: Record<string, unknown> = {}) => ({
    shortcode_media: {
        shortcode: `CODE${i}`, __typename: 'GraphImage', is_video: false, display_url: oe(1_800_000_000 + i),
        edge_media_to_caption: { edges: [{ node: { text: `오늘의 기록 ${i} #여행 #맛집 @friend` } }] },
        edge_liked_by: { count: 100 + i }, edge_media_to_comment: { count: i }, taken_at_timestamp: 1_790_000_000 + i * 86400,
        ...extra,
    },
})
const profileCtx = (n: number, extra: Record<string, unknown> = {}) => wrap({
    context: { username: 'tester', full_name: '테스터', followers_count: 1234, posts_count: 56, verified: false, graphql_media: Array.from({ length: n }, (_, i) => media(i + 1, i === 1 ? extra : {})) },
})

describe('인스타 계정 퍼가기 화면 읽기', () => {
    it('캡션 전문, 좋아요, 댓글, 올린 시각, 해시태그, 사진 주소를 가져온다', () => {
        const r = extractInstagramMedia(profileCtx(6))
        expect(r.profile).toMatchObject({ username: 'tester', followers: 1234, postsCount: 56 })
        expect(r.posts).toHaveLength(6)
        const p = r.posts[0]
        expect(p.text).toContain('오늘의 기록 1')
        expect(p.likes).toBe(101)
        expect(p.comments).toBe(1)
        expect(p.hashtags).toEqual(['여행', '맛집'])
        expect(p.mentions).toEqual(['friend'])
        expect(p.postedAt).toMatch(/^2026-/)
        expect(p.imageUrls).toHaveLength(1)
        expect(p.imageExpiresAt).toMatch(/^2027-/)
        expect(p.isReel).toBe(false)
        expect(p.mediaType).toBe('image')
    })
    it('공개 화면 상한은 6개이고 기본 읽기 수도 그에 맞다', () => {
        expect(INSTAGRAM_PUBLIC_MAX).toBe(6)
        expect(extractInstagramMedia(profileCtx(9), 4).posts).toHaveLength(4)
    })
    it('영상은 릴스로, 여러 장 글은 사진 모두 담는다', () => {
        const v = extractInstagramMedia(profileCtx(3, { __typename: 'GraphVideo', is_video: true, video_view_count: 999 })).posts[1]
        expect(v.isReel).toBe(true)
        expect(v.mediaType).toBe('video')
        expect(v.views).toBe(999)
        const c = extractInstagramMedia(profileCtx(3, { __typename: 'GraphSidecar', edge_sidecar_to_children: { edges: [{ node: { display_url: 'https://x/1.jpg' } }, { node: { display_url: 'https://x/2.jpg' } }] } })).posts[1]
        expect(c.mediaType).toBe('carousel')
        expect(c.imageUrls.length).toBe(3)
    })
    it('좋아요 숨김 글은 좋아요를 비워 둔다 (0 으로 지어내지 않는다)', () => {
        const p = extractInstagramMedia(profileCtx(3, { like_and_view_counts_disabled: true })).posts[1]
        expect(p.likes).toBeUndefined()
        expect(p.comments).toBe(2)
    })
    it('못 읽는 화면은 빈 결과', () => {
        expect(extractInstagramMedia('<html>nothing</html>').posts).toEqual([])
        expect(extractInstagramMedia('<script>"contextJSON":"{bad"</script>').posts).toEqual([])
    })
})

describe('인스타 글 하나', () => {
    const html = wrap({ gql_data: { shortcode_media: { shortcode: 'DeCN', __typename: 'GraphVideo', is_video: true, product_type: 'clips', video_view_count: 5000, display_url: oe(1_800_000_000), edge_media_to_caption: { edges: [{ node: { text: '릴스 글 #릴스' } }] }, edge_liked_by: { count: 77 }, edge_media_to_comment: { count: 5 } } } })
    it('릴스 여부, 조회, 좋아요를 읽는다', () => {
        const p = extractInstagramPostMedia(html)!
        expect(p).toMatchObject({ code: 'DeCN', isReel: true, views: 5000, likes: 77, comments: 5, hashtags: ['릴스'] })
    })
    it('올린 날은 게시물 화면 설명에서 (영문, 한글 둘 다)', () => {
        const og = (d: string) => `<meta property="og:description" content="${d}">`
        expect(extractInstagramOgDate(og('1,234 likes, 5 comments - nasa on October 3, 2026: &quot;hi&quot;'))).toBe('2026-10-03T03:00:00.000Z')
        expect(extractInstagramOgDate(og('좋아요 3개 - 2026년 10월 3일'))).toBe('2026-10-03T03:00:00.000Z')
        expect(extractInstagramOgDate('<html></html>')).toBeUndefined()
    })
})

describe('봇이 배울 글 만들기', () => {
    it('계정 요약과 글별 머리말이 붙고, 글 수는 구분선 수와 같다', () => {
        const r = extractInstagramMedia(profileCtx(6))
        const text = formatSocialText(r.profile, r.posts)
        expect(text.split(/\n-{3,}\n/)).toHaveLength(6)
        expect(text).toContain('좋아요 101')
        expect(text).toContain('#여행')
        expect(text).not.toMatch(/[·—–]/)
    })
    it('글 머리말에 숨긴 값을 지어내지 않는다', () => {
        const t = formatSocialPost({ platform: 'instagram', text: '본문 하나', hashtags: [], mentions: [], imageUrls: [] })
        expect(t).toContain('본문 하나')
        expect(t).not.toMatch(/좋아요 \d/)
    })
    it('사진 만료 시각과 해시태그', () => {
        expect(imageExpiry(oe(1_800_000_000))).toBe(new Date(1_800_000_000_000).toISOString())
        expect(imageExpiry('https://x/a.jpg')).toBeUndefined()
        expect(extractHashtags('#a #b #a')).toEqual(['a', 'b'])
    })
    it('저장 줄은 새 표 칸에 맞는다', () => {
        const r = extractInstagramMedia(profileCtx(2))
        const rows = toSocialRows('m1', 's1', 'instagram', r.posts)
        expect(rows).toHaveLength(2)
        expect(rows[0]).toMatchObject({ source_id: 's1', mentor_id: 'm1', platform: 'instagram', post_code: 'CODE1', like_count: 101, comment_count: 1, is_reel: false })
        expect(Array.isArray(rows[0].image_urls)).toBe(true)
    })
})
