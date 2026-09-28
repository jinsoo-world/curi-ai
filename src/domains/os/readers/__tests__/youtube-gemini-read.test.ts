// readYoutube 가 자막이 막혔을 때 Gemini 정리를 글로 쓰는지 (정리 함수는 가짜)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getVideoDetails = vi.fn()
vi.mock('youtube-caption-extractor', () => ({ getVideoDetails: (...a: unknown[]) => getVideoDetails(...a) }))
const getYoutubeDigest = vi.fn()
const keepAlive = vi.fn(async () => {})
vi.mock('../youtube-gemini', async (orig) => ({ ...(await orig<typeof import('../youtube-gemini')>()), getYoutubeDigest: (...a: unknown[]) => getYoutubeDigest(...a), keepAlive: (...a: unknown[]) => keepAlive(...(a as [])) }))

import { readYoutube } from '../youtube'
import { readUrl, cacheClear } from '../index'
vi.mock('dns/promises', () => ({ lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]) }))

const DIGEST = '[요약]\n창업 팀 이야기.\n\n[핵심]\n- 역할 나누기 [0:40]\n\n[구간]\n[0:00] 인사와 주제 소개를 한다. 오늘은 공동 창업자 고르는 법을 말한다고 한다.\n[1:30] 기준 세 가지.'

beforeEach(() => {
    cacheClear()
    getVideoDetails.mockReset().mockRejectedValue(new Error('LOGIN_REQUIRED'))
    getYoutubeDigest.mockReset()
    keepAlive.mockClear()
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/oembed')) return new Response(JSON.stringify({ title: '창업 팀 꾸리기', author_name: '큐리' }), { headers: { 'content-type': 'application/json' } })
        if (url.includes('youtubei/v1/next')) return new Response('{"attributedDescription":{"content":"설명 글"}}', { headers: { 'content-type': 'application/json' } })
        return new Response('nope', { status: 404 })
    }))
})
afterEach(() => vi.unstubAllGlobals())

describe('readYoutube + Gemini 정리', () => {
    it('자막이 막히면 정리를 글로 쓴다 (정리본이라고 적는다)', async () => {
        getYoutubeDigest.mockResolvedValue({ ok: true, text: DIGEST, model: 'gemini-3.5-flash-lite', from: 'gemini' })
        const r = await readYoutube('https://youtu.be/abcdefghijk', { gemini: { userId: 'u1', waitMs: 1000 }, maxChars: 12000 })
        expect(r.ok).toBe(true)
        if (!r.ok) return
        expect(r.method).toBe('gemini')
        expect(r.text).toContain('[영상 정리]')
        expect(r.text).toContain('정리본')
        expect(r.text).toContain('[1:30] 기준 세 가지')
        expect(r.text).toContain('설명 글')
        expect(getYoutubeDigest).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'abcdefghijk', userId: 'u1', title: '창업 팀 꾸리기' }))
    })
    it('gemini 옵션이 없으면 부르지 않는다 (자동 가져오기 등)', async () => {
        const r = await readYoutube('https://youtu.be/abcdefghijk')
        expect(getYoutubeDigest).not.toHaveBeenCalled()
        expect(r.ok && r.method).toBe('meta')
    })
    it('자막이 있으면 부르지 않는다 (무료 길 먼저)', async () => {
        getVideoDetails.mockReset().mockResolvedValue({ title: 't', description: '', subtitles: [{ text: '안녕하세요 오늘은 창업 이야기를 합니다', start: '0', dur: '3' }] })
        const r = await readYoutube('https://youtu.be/abcdefghijk', { gemini: { userId: 'u1' } })
        expect(getYoutubeDigest).not.toHaveBeenCalled()
        expect(r.ok && r.method).toBe('captions')
    })
    it('시간 안에 못 끝나면 설명만으로 답하고 뒤에서 계속한다', async () => {
        getYoutubeDigest.mockReturnValue(new Promise(() => {}))
        const r = await readYoutube('https://youtu.be/abcdefghijk', { gemini: { userId: 'u1', waitMs: 10 } })
        expect(r.ok && r.method).toBe('meta')
        expect(r.ok && r.text).toContain('정리하는 중')
        expect(keepAlive).toHaveBeenCalledTimes(1)
    })
    it('하루 한도에 닿으면 그렇게 적는다', async () => {
        getYoutubeDigest.mockResolvedValue({ ok: false, reason: 'user-limit' })
        const r = await readYoutube('https://youtu.be/abcdefghijk', { gemini: { userId: 'u1', waitMs: 1000 } })
        expect(r.ok && r.text).toContain('한도')
    })
    it('readUrl 은 「설명만」 결과를 기억하지 않는다 (뒤에서 끝난 정리를 다음에 쓰게)', async () => {
        getYoutubeDigest.mockResolvedValueOnce({ ok: false, reason: 'waiting' }).mockResolvedValueOnce({ ok: true, text: DIGEST, model: 'm', from: 'memory' })
        const a = await readUrl('https://www.youtube.com/watch?v=abcdefghijk', { gemini: { userId: 'u1', waitMs: 1000 } })
        const b = await readUrl('https://www.youtube.com/watch?v=abcdefghijk', { gemini: { userId: 'u1', waitMs: 1000 } })
        expect(a.ok && a.method).toBe('meta')
        expect(b.ok && b.method).toBe('gemini')
    })
})
