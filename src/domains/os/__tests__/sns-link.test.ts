import { describe, it, expect } from 'vitest'
import { classifySnsLink, cleanPastedPosts, snsCanonicalKey, PASTE_MIN_CHARS } from '../sns-link'
import { SNS_SUCCESS_LINE, SNS_BONUS_CLOVERS } from '../onboarding'

describe('classifySnsLink', () => {
    it('네이버 블로그는 자동으로 읽지 않고 붙여넣기로 받는다 (약관 위험 제거 0928)', () => {
        const c = classifySnsLink('blog.naver.com/passionjin')
        expect(c.feed).toBe(null)
        expect(c.paste).toBe(true)
        expect(c.url).toBe('https://blog.naver.com/passionjin')
        expect(classifySnsLink('https://m.blog.naver.com/passionjin/223000').url).toBe('https://blog.naver.com/passionjin')
        expect(classifySnsLink('https://blog.naver.com/PostView.naver?blogId=abc_1&logNo=1').url).toBe('https://blog.naver.com/abc_1')
        expect(classifySnsLink('https://rss.blog.naver.com/abc_1.xml').feed).toBe(null)
        expect(() => classifySnsLink('https://blog.naver.com/PostView.naver')).toThrow()
    })
    it('브런치도 붙여넣기, 티스토리는 공식 RSS', () => {
        expect(classifySnsLink('https://brunch.co.kr/@me').paste).toBe(true)
        expect(classifySnsLink('https://brunch.co.kr/@me').feed).toBe(null)
        expect(classifySnsLink('https://myblog.tistory.com/12').feed).toEqual({ kind: 'podcast', handleOrUrl: 'https://myblog.tistory.com/rss' })
    })
    it('같은 블로그는 같은 열쇠 (보너스 한 주소 한 계정)', () => {
        const k = (u: string) => snsCanonicalKey(classifySnsLink(u))
        expect(k('blog.naver.com/PassionJin')).toBe(k('https://m.blog.naver.com/passionjin/223000'))
        expect(k('https://blog.naver.com/PostView.naver?blogId=passionjin&logNo=1')).toBe('naver:passionjin')
        expect(k('https://myblog.tistory.com/12')).toBe(k('https://myblog.tistory.com/'))
        expect(k('https://www.youtube.com/@Curi')).toBe(k('https://m.youtube.com/@curi/videos'))
        expect(k('https://example.com/about/')).toBe(k('https://example.com/about?x=1'))
    })
    it('붙여넣은 글: 짧은 글은 빼고, 같은 글은 한 번, 최대 3편', () => {
        const long = (n: number) => `${n} `.repeat(200)
        expect(cleanPastedPosts(['짧아요', long(1)]).posts.length).toBe(1)
        expect(cleanPastedPosts(['짧아요']).tooShort).toBe(1)
        expect(cleanPastedPosts([long(1), long(1)]).posts.length).toBe(1)
        expect(cleanPastedPosts([long(1), long(2), long(3), long(4)]).posts.length).toBe(3)
        expect(cleanPastedPosts('x').posts.length).toBe(0)
        expect(PASTE_MIN_CHARS).toBe(300)
    })
    it('유튜브는 채널 주소만', () => {
        expect(classifySnsLink('https://www.youtube.com/@curi').feed?.kind).toBe('youtube')
        expect(() => classifySnsLink('https://www.youtube.com/watch?v=abc')).toThrow('채널')
    })
    it('인스타그램, 스레드, X, 틱톡은 링크만 저장 (준비 중)', () => {
        for (const u of ['instagram.com/me', 'https://www.threads.net/@me', 'https://x.com/me', 'twitter.com/me', 'https://www.tiktok.com/@me']) {
            expect(classifySnsLink(u).feed).toBe(null)
        }
        expect(classifySnsLink('https://www.threads.com/@me').platform).toBe('threads')
        for (const u of ['https://www.facebook.com/me', 'facebook.com/pages/abc', 'https://m.facebook.com/me', 'https://fb.com/me', 'https://web.facebook.com/me']) {
            const c = classifySnsLink(u)
            expect(c.platform).toBe('facebook')
            expect(c.feed).toBe(null)
        }
    })
    it('RSS 와 일반 웹', () => {
        expect(classifySnsLink('https://example.com/feed').feed?.kind).toBe('podcast')
        expect(classifySnsLink('https://example.com/rss.xml').feed?.kind).toBe('podcast')
        expect(classifySnsLink('example.com/about').feed).toEqual({ kind: 'website', handleOrUrl: 'https://example.com/about' })
        expect(classifySnsLink('https://me.substack.com').feed?.kind).toBe('substack')
    })
    it('막는 주소', () => {
        expect(() => classifySnsLink('')).toThrow()
        expect(() => classifySnsLink('http://localhost:3000')).toThrow()
        expect(() => classifySnsLink('http://127.0.0.1/a')).toThrow()
        expect(() => classifySnsLink('ftp://example.com')).toThrow()
    })
    it('성공 안내 한 줄', () => {
        expect(SNS_BONUS_CLOVERS).toBe(50)
        expect(SNS_SUCCESS_LINE).toBe('내 글로 봇이 배웠어요. 클로버 50개를 드렸어요')
    })
})
