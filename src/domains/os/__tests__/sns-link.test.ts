import { describe, it, expect } from 'vitest'
import { classifySnsLink } from '../sns-link'
import { SNS_SUCCESS_LINE, SNS_BONUS_CLOVERS } from '../onboarding'

describe('classifySnsLink', () => {
    it('네이버 블로그는 공개 RSS 로 읽는다', () => {
        expect(classifySnsLink('blog.naver.com/passionjin').feed).toEqual({ kind: 'podcast', handleOrUrl: 'https://rss.blog.naver.com/passionjin.xml' })
        expect(classifySnsLink('https://m.blog.naver.com/passionjin/223000').feed?.handleOrUrl).toBe('https://rss.blog.naver.com/passionjin.xml')
        expect(classifySnsLink('https://blog.naver.com/PostView.naver?blogId=abc_1&logNo=1').feed?.handleOrUrl).toBe('https://rss.blog.naver.com/abc_1.xml')
        expect(() => classifySnsLink('https://blog.naver.com/PostView.naver')).toThrow()
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
