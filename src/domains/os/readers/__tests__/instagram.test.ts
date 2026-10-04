import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseInstagramUrl, extractInstagramEmbedPosts, extractInstagramCaption, extractInstagramOgCaption } from '../instagram'

describe('인스타그램 공개 글 읽기', () => {
    it('주소에서 계정과 게시물을 가른다', () => {
        expect(parseInstagramUrl('https://www.instagram.com/kbsnews/')).toEqual({ user: 'kbsnews' })
        expect(parseInstagramUrl('https://instagram.com/p/ABC123xyz/')).toEqual({ post: 'ABC123xyz' })
        expect(parseInstagramUrl('https://www.instagram.com/reel/XYZ/')).toEqual({ post: 'XYZ' })
        expect(parseInstagramUrl('https://www.instagram.com/explore/')).toBeNull()
        expect(parseInstagramUrl('https://example.com/a')).toBeNull()
    })
    it('퍼가기 화면(실제 KBS뉴스 조각)에서 한국어 게시물 글을 뽑는다', () => {
        const html = readFileSync(join(__dirname, 'ig-embed-fixture.txt'), 'utf8')
        const p = extractInstagramEmbedPosts(html)
        expect(p.length).toBeGreaterThan(0)
        expect(p[0].text).toMatch(/[가-힣]/)
        expect(p[0].text).not.toContain('\\n')
    })
    it('게시물 하나의 글(Caption)을 읽는다', () => {
        const html = '<div class="Caption"><a>kbsnews</a> 러닝 열풍 속에<br/>점심 &amp; 달리기</div>'
        expect(extractInstagramCaption(html)).toBe('kbsnews 러닝 열풍 속에\n점심 & 달리기')
    })
    it('/계정/p/코드 모양 주소도 게시물로 읽는다', () => {
        expect(parseInstagramUrl('https://www.instagram.com/nasa/p/DeCNJEyOkpq/')).toEqual({ post: 'DeCNJEyOkpq' })
    })
    it('게시물 화면 og:description 에서 전체 글을 뽑는다', () => {
        const html = '<meta property="og:description" content="1,234 likes, 56 comments - nasa on September 1, 2026: &quot;우주에서 본 지구 &amp; 달 이야기를 오늘 올립니다.&quot;." />'
        expect(extractInstagramOgCaption(html)).toContain('우주에서 본 지구 & 달 이야기를 오늘 올립니다.')
        expect(extractInstagramOgCaption(html)).not.toMatch(/likes/)
    })
})
