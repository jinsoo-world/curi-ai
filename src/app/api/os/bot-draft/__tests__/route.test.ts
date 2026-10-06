// /api/os/bot-draft — 손님 401, 입력 400, 한도 429, 모델이 망가져도 기본값 카드 200
import { describe, it, expect, vi, beforeEach } from 'vitest'

let user: { id: string; user_metadata?: Record<string, unknown> } | null = { id: 'u1', user_metadata: { full_name: '진수' } }
const limits: Record<string, boolean> = {}
const limitOpts: unknown[] = []
const askSideText = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async (_db: unknown, key: string, limit: number, windowSec: number, opts?: unknown) => (limitOpts.push(opts), { allowed: limits[`${key.split(':')[1]}:${limit}:${windowSec}`] !== false }),
}))
vi.mock('@/domains/llm/side-text', () => ({ askSideText: (...a: unknown[]) => askSideText(...a) }))

import { POST } from '@/app/api/os/bot-draft/route'

const post = (body: unknown) => POST(new Request('https://x/api/os/bot-draft', { method: 'POST', body: JSON.stringify(body) }))

beforeEach(() => {
    user = { id: 'u1', user_metadata: { full_name: '진수' } }
    for (const k of Object.keys(limits)) delete limits[k]
    limitOpts.length = 0
    askSideText.mockReset().mockResolvedValue(JSON.stringify({ name: '뉴스봇', oneLiner: '소식 정리', greeting: '안녕하세요', sampleQuestions: ['a', 'b', 'c'], shape: 'hex', color: 'blue' }))
})

describe('/api/os/bot-draft', () => {
    it('손님은 401, 모델을 부르지 않는다', async () => {
        user = null
        const res = await post({ idea: '뉴스' })
        expect(res.status).toBe(401)
        expect(askSideText).not.toHaveBeenCalled()
    })

    it('빈 입력, 너무 긴 입력은 400', async () => {
        expect((await post({})).status).toBe(400)
        expect((await post({ idea: '가'.repeat(201) })).status).toBe(400)
        expect((await post({ sourceText: '가'.repeat(5_001) })).status).toBe(400)
        expect(askSideText).not.toHaveBeenCalled()
    })

    it('분당 5번, 하루 30번을 넘으면 429', async () => {
        limits['m:5:60'] = false
        expect((await post({ idea: '뉴스' })).status).toBe(429)
        delete limits['m:5:60']
        limits['d:30:86400'] = false
        expect((await post({ idea: '뉴스' })).status).toBe(429)
        expect(askSideText).not.toHaveBeenCalled()
    })

    it('잘 되면 초안 한 벌, 비용 기록 갈래(kind bot-draft)로 모델을 부른다', async () => {
        const res = await post({ idea: '업계 뉴스 정리', lang: 'ko' })
        expect(res.status).toBe(200)
        const d = await res.json()
        expect(d.name).toBe('뉴스봇')
        expect(d.sampleQuestions).toHaveLength(3)
        expect(d.prompt.intro).toContain('진수님 팀의 뉴스봇')
        expect(d.promptText).toContain('[승인]')
        expect(d.fallback).toBe(false)
        expect(askSideText.mock.calls[0][0]).toMatchObject({ kind: 'bot-draft', route: '/api/os/bot-draft', userId: 'u1' })
        expect(limitOpts).toEqual([{ failClosed: true }, { failClosed: true }])   // 셀 수 없으면 막는다 (모델 비용)
    })

    it('모델이 이상한 답을 하거나 터져도 기본값 카드 200', async () => {
        askSideText.mockResolvedValueOnce('JSON 아님')
        const a = await (await post({ job: 'planning_lead' })).json()
        expect(a.fallback).toBe(true)
        expect(a.name).toBe('기획팀장')
        askSideText.mockRejectedValueOnce(new Error('boom'))
        const res = await post({ idea: '뉴스' })
        expect(res.status).toBe(200)
        expect((await res.json()).fallback).toBe(true)
    })
})
