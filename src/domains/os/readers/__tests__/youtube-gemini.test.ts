// 유튜브 Gemini 정리 = 한도, 저장, 값 계산. 진짜 Gemini, 진짜 표는 쓰지 않는다(가짜로 바꿔 끼운다).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    geminiYoutubeConfig, getYoutubeDigest, digestMemoryClear, costUsd, usageFrom, isUsableDigest, kstDayStart,
    digestPrompt, digestWithin, cleanDigest,
} from '../youtube-gemini'
import type { DigestStore, GenerateFn, GeminiYoutubeConfig } from '../youtube-gemini'

const GOOD = '[요약]\n이 영상은 창업 초기 팀을 꾸리는 법을 설명한다. 공동 창업자를 고르는 기준을 말한다.\n\n[핵심]\n- 역할을 먼저 나눈다 [0:40]\n\n[구간]\n[0:00] 인사와 오늘 주제 소개. 창업 3년 차 경험을 바탕으로 말한다고 한다.\n[1:30] 공동 창업자 기준 세 가지.'

function fakeStore(over: Partial<DigestStore> = {}) {
    const saved = new Map<string, { videoId: string; text: string; model: string }>()
    const state = { counts: { user: 0, global: 0 } }
    const starts: { videoId: string; userId: string; model: string }[] = []
    const finishes: { status: string; costUsd?: number }[] = []
    const s = {
        saved, starts, finishes,
        get counts() { return state.counts },
        set counts(v: { user: number; global: number }) { state.counts = v },
        get: vi.fn(async (id: string) => saved.get(id) ?? null),
        countToday: vi.fn(async () => state.counts),
        start: vi.fn(async (row: { videoId: string; userId: string; model: string }) => { starts.push(row); return `call-${starts.length}` }),
        finish: vi.fn(async (_id: string | null, row: { status: string; costUsd?: number }) => { finishes.push(row) }),
        save: vi.fn(async (row: { videoId: string; text: string; model: string }) => { saved.set(row.videoId, row) }),
        ...over,
    }
    return s
}

const cfg: GeminiYoutubeConfig = { ...geminiYoutubeConfig({ GEMINI_API_KEY: 'x' }) }
const usage = { promptTokenCount: 9800, candidatesTokenCount: 900, thoughtsTokenCount: 0, totalTokenCount: 10700,
    promptTokensDetails: [{ modality: 'VIDEO', tokenCount: 2100 }, { modality: 'AUDIO', tokenCount: 7500 }, { modality: 'TEXT', tokenCount: 200 }] }

beforeEach(() => digestMemoryClear())

describe('한도 설정 (환경변수)', () => {
    it('기본값 = 3.5 flash-lite, 60분, 1인 하루 10개, 전체 300개, fps 0.1', () => {
        const c = geminiYoutubeConfig({ GEMINI_API_KEY: 'k' })
        expect(c).toMatchObject({ enabled: true, models: ['gemini-3.5-flash-lite'], maxMinutes: 60, userDaily: 10, globalDaily: 300, fps: 0.1, maxOutputTokens: 3000 })
    })
    it('끄기 스위치와 열쇠 없음', () => {
        expect(geminiYoutubeConfig({ GEMINI_API_KEY: 'k', YT_GEMINI_ENABLED: 'false' }).enabled).toBe(false)
        expect(geminiYoutubeConfig({}).enabled).toBe(false)
    })
    it('이상한 값은 안전한 범위로', () => {
        const c = geminiYoutubeConfig({ GEMINI_API_KEY: 'k', YT_GEMINI_USER_DAILY: 'abc', YT_GEMINI_MAX_MINUTES: '999', YT_GEMINI_FPS: '5', YT_GEMINI_MODEL: 'a, b' })
        expect(c.userDaily).toBe(10)
        expect(c.maxMinutes).toBe(180)
        expect(c.fps).toBe(1)
        expect(c.models).toEqual(['a', 'b'])
    })
})

describe('값 계산', () => {
    it('usageMetadata 를 칸으로 나눈다', () => {
        expect(usageFrom(usage)).toEqual({ promptTokens: 9800, outputTokens: 900, thoughtsTokens: 0, totalTokens: 10700, videoTokens: 2100, audioTokens: 7500 })
    })
    it('3.5 flash-lite = 입력 $0.30, 출력 $2.50 (100만 토큰당)', () => {
        expect(costUsd('gemini-3.5-flash-lite', usageFrom(usage))).toBeCloseTo((9800 * 0.30 + 900 * 2.5) / 1e6, 6)
    })
    it('3.1 flash-lite 는 소리를 $0.50 으로 센다', () => {
        expect(costUsd('gemini-3.1-flash-lite', usageFrom(usage))).toBeCloseTo((2300 * 0.25 + 7500 * 0.5 + 900 * 1.5) / 1e6, 6)
    })
    it('한국 시각 0시', () => {
        expect(kstDayStart(new Date('2026-09-28T16:30:00Z')).toISOString()).toBe('2026-09-28T15:00:00.000Z')
        expect(kstDayStart(new Date('2026-09-28T14:59:00Z')).toISOString()).toBe('2026-09-27T15:00:00.000Z')
    })
    it('형식이 무너진 결과는 저장하지 않는다', () => {
        expect(isUsableDigest(GOOD)).toBe(true)
        expect(isUsableDigest('죄송합니다. 영상을 볼 수 없습니다.')).toBe(false)
    })
    it('가운뎃점, 긴 줄표는 쉼표로', () => {
        expect(cleanDigest('수능 서술\u00B7논술형 도입 \u2014 찬반')).toBe('수능 서술, 논술형 도입, 찬반')
    })
    it('프롬프트에 한도 분과 형식', () => {
        const p = digestPrompt(60)
        expect(p).toContain('앞 60분까지만')
        expect(p).toContain('[구간]')
        expect(p).not.toMatch(/[\u00B7\u2014]/)
    })
})

describe('getYoutubeDigest', () => {
    it('처음 = Gemini 한 번 부르고 저장, 토큰과 값을 남긴다', async () => {
        const store = fakeStore()
        const generate = vi.fn<GenerateFn>(async () => ({ text: GOOD, usageMetadata: usage }))
        const r = await getYoutubeDigest({ videoId: 'abcdefghijk', userId: 'u1', store, generate, config: cfg })
        expect(r).toMatchObject({ ok: true, from: 'gemini', model: 'gemini-3.5-flash-lite' })
        expect(generate).toHaveBeenCalledTimes(1)
        const req = generate.mock.calls[0][0]
        expect(req.url).toBe('https://www.youtube.com/watch?v=abcdefghijk')
        expect(req.cfg.fps).toBe(0.1)
        expect(store.saved.get('abcdefghijk')?.text).toBe(GOOD)
        expect(store.finishes[0]).toMatchObject({ status: 'ok' })
        expect(store.finishes[0].costUsd).toBeGreaterThan(0)
    })
    it('누가 이미 받은 영상 = 표에서 꺼낸다 (돈 없음, 한도도 안 센다)', async () => {
        const store = fakeStore()
        store.saved.set('abcdefghijk', { videoId: 'abcdefghijk', text: GOOD, model: 'gemini-3.5-flash-lite' })
        store.counts = { user: 999, global: 999 }
        const generate = vi.fn<GenerateFn>()
        const r = await getYoutubeDigest({ videoId: 'abcdefghijk', userId: 'u2', store, generate, config: cfg })
        expect(r).toMatchObject({ ok: true, from: 'db' })
        expect(generate).not.toHaveBeenCalled()
        // 그다음은 서버 메모리에서
        const again = await getYoutubeDigest({ videoId: 'abcdefghijk', userId: 'u3', store, generate, config: cfg })
        expect(again).toMatchObject({ ok: true, from: 'memory' })
    })
    it('1인 하루 한도, 전체 하루 한도', async () => {
        const generate = vi.fn<GenerateFn>(async () => ({ text: GOOD, usageMetadata: usage }))
        const s1 = fakeStore(); s1.counts = { user: 10, global: 10 }
        expect(await getYoutubeDigest({ videoId: 'aaaaaaaaaaa', userId: 'u1', store: s1, generate, config: cfg })).toEqual({ ok: false, reason: 'user-limit' })
        const s2 = fakeStore(); s2.counts = { user: 0, global: 300 }
        expect(await getYoutubeDigest({ videoId: 'bbbbbbbbbbb', userId: 'u1', store: s2, generate, config: cfg })).toEqual({ ok: false, reason: 'global-limit' })
        expect(generate).not.toHaveBeenCalled()
    })
    it('로그인 안 한 사람, 꺼진 상태, 표가 없을 때는 부르지 않는다', async () => {
        const generate = vi.fn<GenerateFn>()
        expect(await getYoutubeDigest({ videoId: 'ccccccccccc', userId: null, store: fakeStore(), generate, config: cfg })).toEqual({ ok: false, reason: 'no-user' })
        expect(await getYoutubeDigest({ videoId: 'ddddddddddd', userId: 'u', store: fakeStore(), generate, config: { ...cfg, enabled: false } })).toEqual({ ok: false, reason: 'disabled' })
        expect(await getYoutubeDigest({ videoId: 'eeeeeeeeeee', userId: 'u', store: null, generate, config: cfg })).toEqual({ ok: false, reason: 'disabled' })
        expect(generate).not.toHaveBeenCalled()
    })
    it('동시에 같은 영상 = 한 번만 부른다', async () => {
        const store = fakeStore()
        let release: () => void = () => {}
        const generate = vi.fn<GenerateFn>(() => new Promise(res => { release = () => res({ text: GOOD, usageMetadata: usage }) }))
        const a = getYoutubeDigest({ videoId: 'fffffffffff', userId: 'u1', store, generate, config: cfg })
        const b = getYoutubeDigest({ videoId: 'fffffffffff', userId: 'u2', store, generate, config: cfg })
        await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1))
        release()
        expect(await a).toMatchObject({ ok: true })
        expect(await b).toMatchObject({ ok: true })
        expect(generate).toHaveBeenCalledTimes(1)
    })
    it('실패 = 기록만 하고 저장하지 않는다. 생각 설정 거절이면 설정 없이 한 번 더', async () => {
        const store = fakeStore()
        const generate = vi.fn<GenerateFn>()
            .mockRejectedValueOnce(new Error('thinking level MINIMAL is not supported'))
            .mockRejectedValueOnce(new Error('500 internal'))
        const r = await getYoutubeDigest({ videoId: 'ggggggggggg', userId: 'u1', store, generate, config: cfg })
        expect(r).toEqual({ ok: false, reason: 'error' })
        expect(generate).toHaveBeenCalledTimes(2)
        expect(generate.mock.calls[1][0].minimalThinking).toBe(false)
        expect(store.saved.size).toBe(0)
        expect(store.finishes[0]).toMatchObject({ status: 'error' })
    })
    it('모델이 없다는 답이면 다음 모델', async () => {
        const store = fakeStore()
        const generate = vi.fn<GenerateFn>()
            .mockRejectedValueOnce(new Error('404 models/gemini-x is not found'))
            .mockResolvedValueOnce({ text: GOOD, usageMetadata: usage })
        const r = await getYoutubeDigest({ videoId: 'hhhhhhhhhhh', userId: 'u1', store, generate, config: { ...cfg, models: ['gemini-x', 'gemini-3.5-flash-lite'] } })
        expect(r).toMatchObject({ ok: true, model: 'gemini-3.5-flash-lite' })
    })
    it('쓸모없는 결과(형식 무너짐)는 저장하지 않는다', async () => {
        const store = fakeStore()
        const generate = vi.fn<GenerateFn>(async () => ({ text: '못 봤어요', usageMetadata: usage }))
        expect(await getYoutubeDigest({ videoId: 'iiiiiiiiiii', userId: 'u1', store, generate, config: cfg })).toEqual({ ok: false, reason: 'empty' })
        expect(store.saved.size).toBe(0)
        expect(store.finishes[0]).toMatchObject({ status: 'empty' })
    })
    it('기다리는 시간이 다 되면 waiting', async () => {
        const never = new Promise<never>(() => {})
        expect(await digestWithin(never, 5)).toEqual({ ok: false, reason: 'waiting' })
    })
})
