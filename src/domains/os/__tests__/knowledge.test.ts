import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSafeExternalUrl, isYoutubeUrl, htmlToText, pickTitle, assertBotOwned, BotNotMine } from '../knowledge'

describe('isSafeExternalUrl — 우리 서버가 대신 열어도 되는 주소인가', () => {
    it('평범한 공개 주소는 통과', () => {
        expect(isSafeExternalUrl('https://curious-500.com/post/1')).toBe(true)
        expect(isSafeExternalUrl('http://example.com')).toBe(true)
    })

    it('사내망·내 컴퓨터 주소는 막는다', () => {
        for (const 주소 of [
            'http://localhost:3000/secret',
            'http://127.0.0.1/',
            'http://10.0.0.5/',
            'http://192.168.0.1/',
            'http://172.16.3.4/',
            'http://169.254.169.254/latest/meta-data/',   // 클라우드 열쇠가 나오는 자리
            'http://db.internal/',
        ]) {
            expect(isSafeExternalUrl(주소), 주소).toBe(false)
        }
    })

    it('http·https 가 아닌 것은 막는다', () => {
        expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
        expect(isSafeExternalUrl('ftp://a.com')).toBe(false)
        expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
        expect(isSafeExternalUrl('그냥 글')).toBe(false)
        expect(isSafeExternalUrl('')).toBe(false)
    })
})

describe('isYoutubeUrl', () => {
    it('유튜브 주소를 알아본다', () => {
        expect(isYoutubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
        expect(isYoutubeUrl('https://youtu.be/abc')).toBe(true)
        expect(isYoutubeUrl('https://m.youtube.com/watch?v=abc')).toBe(true)
    })
    it('비슷해 보이는 남의 주소는 아니다', () => {
        expect(isYoutubeUrl('https://youtube.com.evil.net/watch')).toBe(false)
        expect(isYoutubeUrl('https://naver.com')).toBe(false)
        expect(isYoutubeUrl('아무 글')).toBe(false)
    })
})

describe('htmlToText / pickTitle', () => {
    it('스크립트·스타일·태그를 걷어내고 글만 남긴다', () => {
        const html = '<html><head><style>b{}</style><script>alert(1)</script></head><body><h1>제목</h1><p>본문 &amp; 내용</p></body></html>'
        const t = htmlToText(html)
        expect(t).toContain('제목')
        expect(t).toContain('본문 & 내용')
        expect(t).not.toContain('alert')
        expect(t).not.toContain('<p>')
    })

    it('제목 태그를 제목으로 쓰고, 없으면 주소를 쓴다', () => {
        expect(pickTitle('<title>큐리어스 글</title>', 'https://a.com')).toBe('큐리어스 글')
        expect(pickTitle('<html>없음</html>', 'https://a.com')).toBe('https://a.com')
    })
})

/** 가짜 Supabase — 어떤 조건이 걸렸는지 본다 */
function makeDb(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
    const eqs: [string, unknown][] = []
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
        from: self, select: self,
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain },
        maybeSingle: async () => result,
    })
    return { db: chain as unknown as SupabaseClient, eqs }
}

describe('assertBotOwned — 남의 봇 자료는 서버에서 막힌다', () => {
    it('내 팀 봇이면 통과하고, user_id 와 mentor_id 를 둘 다 건다', async () => {
        const { db, eqs } = makeDb({ data: { id: 'tb1' }, error: null })
        await assertBotOwned(db, 'u1', 'm1')
        expect(eqs).toContainEqual(['user_id', 'u1'])
        expect(eqs).toContainEqual(['mentor_id', 'm1'])
    })

    it('내 팀에 없으면 막는다', async () => {
        const { db } = makeDb({ data: null, error: null })
        await expect(assertBotOwned(db, 'u1', 'm9')).rejects.toBeInstanceOf(BotNotMine)
    })

    it('표가 아직 없어도 열어 주지 않는다 (기본 거절)', async () => {
        const { db } = makeDb({ data: null, error: { code: '42P01', message: 'no table' } })
        await expect(assertBotOwned(db, 'u1', 'm1')).rejects.toBeInstanceOf(BotNotMine)
    })

    it('빈 값이면 막는다', async () => {
        const { db } = makeDb({ data: { id: 'tb1' }, error: null })
        await expect(assertBotOwned(db, '', 'm1')).rejects.toBeInstanceOf(BotNotMine)
        await expect(assertBotOwned(db, 'u1', '')).rejects.toBeInstanceOf(BotNotMine)
    })
})
