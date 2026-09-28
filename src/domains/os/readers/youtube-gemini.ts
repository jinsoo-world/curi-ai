// domains/os/readers = 자막을 못 받은 유튜브 영상을 Gemini 에게 「한 번만」 보여 주고 한국어 구간 정리를 받는다.
//
// 대표 결정 0928 「가성비 있게 가자」.
//   - 무료 자막 길이 먼저다(youtube.ts). 자막이 막혔을 때(Vercel 서버 IP)만 여기로 온다.
//   - 모델 = gemini-3.5-flash-lite (이미 쓰는 가장 싼 모델). 소리 위주라 화면은 10초에 한 장(fps 0.1), 낮은 해상도.
//     3.1-flash-lite 는 영상 글자값은 싸지만 소리 입력이 100만 토큰당 $0.50 이라 소리가 대부분인 이 일에는 더 비싸다.
//   - 한 영상은 **모든 사람을 통틀어 한 번만** 돈을 낸다 = 영상 번호로 youtube_digests 표에 저장, 서버 메모리에도.
//   - 돈 폭주 막기: 앞 60분까지만 본다(endOffset), 1인 하루 새 영상 10개, 전체 하루 300개, 시간 한도.
//     전부 환경변수로 바꿀 수 있고, YT_GEMINI_ENABLED=false 한 줄이면 끈다.
//   - 부를 때마다 토큰 수(usageMetadata)와 계산한 값(달러)을 youtube_digest_calls 표와 서버 기록에 남긴다.
//   - 실패하면 절대 던지지 않는다. 부른 쪽은 지금처럼 설명, 챕터만으로 답한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { logLlmUsage } from '@/domains/llm/usage-log'
import { USD_TO_KRW_ESTIMATE } from '@/domains/llm/prices'

/* ────────────── 한도 (환경변수, 안전한 기본값) ────────────── */

export interface GeminiYoutubeConfig {
    enabled: boolean
    /** 앞에서부터 차례로 시도 (모델이 없다는 답이면 다음 것) */
    models: string[]
    maxMinutes: number
    userDaily: number
    globalDaily: number
    /** Gemini 한 번 부르는 시간 한도 */
    timeoutMs: number
    /** 대화 중에 기다려 주는 시간. 넘으면 이번 답은 설명만으로, 정리는 뒤에서 끝나 저장된다 */
    chatWaitMs: number
    fps: number
    maxOutputTokens: number
}

function num(v: string | undefined, def: number, min: number, max: number): number {
    const n = Number(v)
    if (v === undefined || v === '' || !Number.isFinite(n)) return def
    return Math.min(max, Math.max(min, n))
}

export function geminiYoutubeConfig(env: Record<string, string | undefined> = process.env): GeminiYoutubeConfig {
    const models = String(env.YT_GEMINI_MODEL || 'gemini-3.5-flash-lite').split(',').map(s => s.trim()).filter(Boolean)
    return {
        enabled: String(env.YT_GEMINI_ENABLED ?? 'true').toLowerCase() !== 'false' && !!env.GEMINI_API_KEY,
        models: models.length ? models : ['gemini-3.5-flash-lite'],
        maxMinutes: num(env.YT_GEMINI_MAX_MINUTES, 60, 1, 180),
        userDaily: num(env.YT_GEMINI_USER_DAILY, 10, 0, 1000),
        globalDaily: num(env.YT_GEMINI_GLOBAL_DAILY, 300, 0, 100_000),
        timeoutMs: num(env.YT_GEMINI_TIMEOUT_MS, 50_000, 5_000, 280_000),
        chatWaitMs: num(env.YT_GEMINI_WAIT_MS, 25_000, 0, 55_000),
        fps: num(env.YT_GEMINI_FPS, 0.1, 0.02, 1),
        maxOutputTokens: num(env.YT_GEMINI_MAX_OUTPUT, 3_000, 500, 8_000),
    }
}

/* ────────────── 값 계산 (달러, 공식 가격표 2026-09-24) ────────────── */

/** 100만 토큰당 달러. audio 가 없으면 input 과 같다. 표에 없는 모델은 비싼 쪽(3.8 flash)으로 잡는다 */
const PRICES: Record<string, { input: number; audio?: number; output: number }> = {
    'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
    'gemini-3.1-flash-lite': { input: 0.25, audio: 0.50, output: 1.50 },
    'gemini-2.5-flash-lite': { input: 0.10, audio: 0.30, output: 0.40 },
    'gemini-3.8-flash': { input: 0.75, output: 3.75 },
}

export interface DigestUsage {
    promptTokens: number
    outputTokens: number
    thoughtsTokens: number
    totalTokens: number
    videoTokens: number
    audioTokens: number
}

export function usageFrom(meta: unknown): DigestUsage {
    const m = (meta ?? {}) as {
        promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number
        promptTokensDetails?: { modality?: string; tokenCount?: number }[]
    }
    const by = (mod: string) => (m.promptTokensDetails ?? []).filter(d => String(d?.modality ?? '').toUpperCase() === mod)
        .reduce((a, d) => a + (Number(d?.tokenCount) || 0), 0)
    const promptTokens = Number(m.promptTokenCount) || 0
    const outputTokens = Number(m.candidatesTokenCount) || 0
    const thoughtsTokens = Number(m.thoughtsTokenCount) || 0
    return {
        promptTokens, outputTokens, thoughtsTokens,
        totalTokens: Number(m.totalTokenCount) || promptTokens + outputTokens + thoughtsTokens,
        videoTokens: by('VIDEO'), audioTokens: by('AUDIO'),
    }
}

/** 이 사용량이 유료 가격표로 얼마인지(달러). 미리보기 기간에 실제로 청구되는지는 결제 화면으로 확인한다 */
export function costUsd(model: string, u: DigestUsage): number {
    const p = PRICES[model] ?? PRICES['gemini-3.8-flash']
    const audio = Math.min(u.audioTokens, u.promptTokens)
    const other = Math.max(0, u.promptTokens - audio)
    const usd = (other * p.input + audio * (p.audio ?? p.input) + (u.outputTokens + u.thoughtsTokens) * p.output) / 1e6
    return Math.round(usd * 1e6) / 1e6
}

/* ────────────── 프롬프트와 결과 모양 ────────────── */

export function digestPrompt(maxMinutes: number): string {
    return [
        '이 유튜브 영상을 보고(주로 소리를 듣고) 한국어로 정리해 주세요. 영상에 없는 내용은 절대 지어내지 마세요.',
        `영상이 ${maxMinutes}분보다 길면 앞 ${maxMinutes}분까지만 주어집니다. 주어진 부분만 정리하세요.`,
        '아래 형식을 그대로 지켜 주세요. 머리말, 맺음말은 쓰지 마세요.',
        '',
        '[요약]',
        '영상 전체를 3~5문장으로.',
        '',
        '[핵심]',
        '- 핵심 내용 5~8개. 각 줄 끝에 영상 속 시각을 [분:초]로.',
        '',
        '[구간]',
        '[0:00] 이 구간에서 한 말을 구체적으로 2~4문장 (사람 이름, 숫자, 예시, 인용을 살려서)',
        '[0:30] ...',
        '영상 처음부터 끝까지 고르게 덮으세요. 5분 안쪽 영상은 30초 간격, 긴 영상은 1~3분 간격. 시각은 [분:초], 한 시간이 넘으면 [시:분:초].',
        '가운뎃점과 긴 줄표는 쓰지 말고 쉼표로 쓰세요.',
        '',
        '말이 없는 영상이면 화면에 보이는 것을 적으세요. 한국어가 아닌 영상도 한국어로 정리하세요.',
    ].join('\n')
}

/** 우리 글 규칙: 가운뎃점(U+00B7), 긴 줄표(U+2014)는 쉼표로 바꾼다 (모델이 가끔 쓴다) */
export function cleanDigest(text: string): string {
    return String(text ?? '').replace(/\s*[\u00B7\u2014]\s*/g, ', ').trim()
}

/** 쓸 만한 결과인가 (형식이 무너졌거나 너무 짧으면 저장하지 않는다 = 다음에 다시 시도) */
export function isUsableDigest(text: string): boolean {
    const t = String(text ?? '').trim()
    return t.length >= 120 && /\[(요약|핵심|구간)\]/.test(t)
}

/* ────────────── 저장소 (표 2개). 시험에서는 가짜로 바꿔 끼운다 ────────────── */

export interface StoredDigest { videoId: string; text: string; model: string }

export interface DigestStore {
    get(videoId: string): Promise<StoredDigest | null>
    /** 오늘(한국 시각 0시부터) 부른 횟수. 실패도 센다(돈이 나갔을 수 있다) */
    countToday(userId: string, since: Date): Promise<{ user: number; global: number }>
    start(row: { videoId: string; userId: string; model: string }): Promise<string | null>
    finish(callId: string | null, row: { status: 'ok' | 'error' | 'empty'; model: string; usage?: DigestUsage; costUsd?: number; ms: number; error?: string }): Promise<void>
    save(row: StoredDigest & { title: string; channel: string; usage: DigestUsage }): Promise<void>
}

/** 한국 시각 오늘 0시 (UTC Date 로) */
export function kstDayStart(now = new Date()): Date {
    const kst = new Date(now.getTime() + 9 * 3600_000)
    return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000)
}

export function supabaseDigestStore(db: SupabaseClient): DigestStore {
    return {
        async get(videoId) {
            const { data, error } = await db.from('youtube_digests').select('video_id, text, model').eq('video_id', videoId).maybeSingle()
            if (error || !data) return null
            return { videoId: data.video_id as string, text: data.text as string, model: data.model as string }
        },
        async countToday(userId, since) {
            const iso = since.toISOString()
            const [u, g] = await Promise.all([
                db.from('youtube_digest_calls').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', iso),
                db.from('youtube_digest_calls').select('id', { count: 'exact', head: true }).gte('created_at', iso),
            ])
            // 표를 못 읽으면 한도를 넘은 것으로 본다(돈이 새는 쪽보다 안 부르는 쪽이 안전)
            if (u.error || g.error) return { user: Number.MAX_SAFE_INTEGER, global: Number.MAX_SAFE_INTEGER }
            return { user: u.count ?? 0, global: g.count ?? 0 }
        },
        async start({ videoId, userId, model }) {
            const { data, error } = await db.from('youtube_digest_calls').insert({ video_id: videoId, user_id: userId, model, status: 'started' }).select('id').single()
            return error || !data ? null : (data.id as string)
        },
        async finish(callId, r) {
            if (!callId) return
            await db.from('youtube_digest_calls').update({
                status: r.status, model: r.model, ms: r.ms, error: r.error?.slice(0, 300) ?? null,
                prompt_tokens: r.usage?.promptTokens ?? null, output_tokens: r.usage?.outputTokens ?? null,
                thoughts_tokens: r.usage?.thoughtsTokens ?? null, total_tokens: r.usage?.totalTokens ?? null,
                video_tokens: r.usage?.videoTokens ?? null, audio_tokens: r.usage?.audioTokens ?? null,
                cost_usd: r.costUsd ?? null,
            }).eq('id', callId)
        },
        async save(r) {
            await db.from('youtube_digests').upsert({
                video_id: r.videoId, title: r.title.slice(0, 200), channel: r.channel.slice(0, 120), text: r.text, model: r.model,
                prompt_tokens: r.usage.promptTokens, output_tokens: r.usage.outputTokens,
                thoughts_tokens: r.usage.thoughtsTokens, total_tokens: r.usage.totalTokens,
            }, { onConflict: 'video_id' })
        },
    }
}

/* ────────────── Gemini 부르기 ────────────── */

export interface GenerateResult { text: string; usageMetadata?: unknown }
export type GenerateFn = (req: { model: string; url: string; prompt: string; cfg: GeminiYoutubeConfig; signal: AbortSignal; minimalThinking: boolean }) => Promise<GenerateResult>

/** 진짜 Gemini (필요할 때만 SDK 를 불러온다) */
export const geminiGenerate: GenerateFn = async ({ model, url, prompt, cfg, signal, minimalThinking }) => {
    const { GoogleGenAI, MediaResolution, ThinkingLevel } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    const res = await ai.models.generateContent({
        model,
        contents: [{
            role: 'user',
            parts: [
                { fileData: { fileUri: url }, videoMetadata: { fps: cfg.fps, endOffset: `${Math.round(cfg.maxMinutes * 60)}s` } },
                { text: prompt },
            ],
        }],
        config: {
            abortSignal: signal,
            temperature: 0.2,
            maxOutputTokens: cfg.maxOutputTokens,
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_LOW,
            ...(minimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
        },
    })
    return { text: res.text ?? '', usageMetadata: res.usageMetadata }
}

/* ────────────── 한 영상 정리 받기 (저장 → 메모리 → 한도 → 부르기) ────────────── */

export type DigestOutcome =
    | { ok: true; text: string; model: string; from: 'memory' | 'db' | 'gemini' }
    | { ok: false; reason: 'disabled' | 'no-user' | 'user-limit' | 'global-limit' | 'error' | 'empty' | 'waiting' }

const memory = new Map<string, StoredDigest>()
const MEMORY_MAX = 128
const inflight = new Map<string, Promise<DigestOutcome>>()

export function digestMemoryClear() { memory.clear(); inflight.clear() }

function remember(d: StoredDigest) {
    if (memory.size >= MEMORY_MAX) memory.delete(memory.keys().next().value as string)
    memory.set(d.videoId, d)
}

export interface DigestRequest {
    videoId: string
    userId: string | null | undefined
    title?: string
    channel?: string
    /** 시험용 바꿔 끼우기 */
    store?: DigestStore | null
    generate?: GenerateFn
    config?: GeminiYoutubeConfig
    now?: Date
}

function defaultStore(): DigestStore | null {
    try {
        // 열쇠가 없으면(시험, 로컬) null = Gemini 를 부르지 않는다 (한도를 셀 수 없으면 안 부른다)
        return supabaseDigestStore(createAdminClient())
    } catch {
        return null
    }
}

/**
 * 영상 정리를 받는다. 절대 던지지 않는다.
 * 같은 서버에서 같은 영상을 동시에 여러 명이 넣어도 Gemini 는 한 번만 부른다(inflight).
 */
export function getYoutubeDigest(req: DigestRequest): Promise<DigestOutcome> {
    const hit = memory.get(req.videoId)
    if (hit) return Promise.resolve({ ok: true, text: hit.text, model: hit.model, from: 'memory' })
    const running = inflight.get(req.videoId)
    if (running) return running
    const p = runDigest(req).catch((): DigestOutcome => ({ ok: false, reason: 'error' })).finally(() => inflight.delete(req.videoId))
    inflight.set(req.videoId, p)
    return p
}

async function runDigest(req: DigestRequest): Promise<DigestOutcome> {
    const cfg = req.config ?? geminiYoutubeConfig()
    const store = req.store === undefined ? defaultStore() : req.store
    const url = `https://www.youtube.com/watch?v=${req.videoId}`

    // 1) 누가 이미 돈을 낸 영상이면 표에서 꺼낸다 (끈 상태여도 저장된 것은 쓴다)
    if (store) {
        const saved = await store.get(req.videoId).catch(() => null)
        if (saved?.text) { remember(saved); return { ok: true, text: saved.text, model: saved.model, from: 'db' } }
    }
    if (!cfg.enabled || !store) return { ok: false, reason: 'disabled' }
    if (!req.userId) return { ok: false, reason: 'no-user' }

    // 2) 한도
    const counts = await store.countToday(req.userId, kstDayStart(req.now)).catch(() => ({ user: Number.MAX_SAFE_INTEGER, global: Number.MAX_SAFE_INTEGER }))
    if (counts.global >= cfg.globalDaily) { console.warn('[yt-gemini] 전체 하루 한도', { global: counts.global }); return { ok: false, reason: 'global-limit' } }
    if (counts.user >= cfg.userDaily) return { ok: false, reason: 'user-limit' }

    // 3) 부르기 (모델이 없다는 답이면 다음 모델, 생각 설정을 못 받는 모델이면 설정 없이 한 번 더. 둘 다 돈이 안 나가는 거절이다)
    const generate = req.generate ?? geminiGenerate
    const prompt = digestPrompt(cfg.maxMinutes)
    const started = Date.now()
    let lastError = ''
    for (const model of cfg.models) {
        const callId = await store.start({ videoId: req.videoId, userId: req.userId, model }).catch(() => null)
        let minimalThinking = true
        for (let attempt = 0; attempt < 2; attempt++) {
            const left = cfg.timeoutMs - (Date.now() - started)
            if (left < 2_000) break
            try {
                const r = await generate({ model, url, prompt, cfg, signal: AbortSignal.timeout(left), minimalThinking })
                const usage = usageFrom(r.usageMetadata)
                const cost = costUsd(model, usage)
                const ms = Date.now() - started
                const text = cleanDigest(r.text ?? '')
                console.log('[yt-gemini] 사용량', { videoId: req.videoId, model, ms, ...usage, costUsd: cost })
                logLlmUsage({
                    route: 'youtube-gemini', kind: 'youtube', provider: 'gemini', model, userId: req.userId,
                    inputTokens: usage.promptTokens, outputTokens: usage.outputTokens + usage.thoughtsTokens,
                    latencyMs: ms, costKrw: Math.round(cost * USD_TO_KRW_ESTIMATE * 10_000) / 10_000,
                    meta: { videoId: req.videoId, audioTokens: usage.audioTokens, videoTokens: usage.videoTokens },
                })
                if (!isUsableDigest(text)) {
                    await store.finish(callId, { status: 'empty', model, usage, costUsd: cost, ms }).catch(() => {})
                    return { ok: false, reason: 'empty' }
                }
                await store.finish(callId, { status: 'ok', model, usage, costUsd: cost, ms }).catch(() => {})
                await store.save({ videoId: req.videoId, text, model, title: req.title ?? '', channel: req.channel ?? '', usage }).catch(() => {})
                remember({ videoId: req.videoId, text, model })
                return { ok: true, text, model, from: 'gemini' }
            } catch (e) {
                lastError = e instanceof Error ? e.message : String(e)
                logLlmUsage({
                    route: 'youtube-gemini', kind: 'youtube', provider: 'gemini', model, userId: req.userId,
                    latencyMs: Date.now() - started, ok: false, error: lastError, meta: { videoId: req.videoId },
                })
                if (minimalThinking && /thinking/i.test(lastError)) { minimalThinking = false; continue }
                break
            }
        }
        await store.finish(callId, { status: 'error', model, ms: Date.now() - started, error: lastError }).catch(() => {})
        console.warn('[yt-gemini] 실패', { videoId: req.videoId, model, error: lastError.slice(0, 200) })
        if (!/not found|404|not supported|unsupported model/i.test(lastError)) break
    }
    return { ok: false, reason: 'error' }
}

/** 기다리다 시간이 다 되면 「waiting」. 정리는 뒤에서 계속되어 저장된다(다음 질문부터 쓴다) */
export async function digestWithin(p: Promise<DigestOutcome>, waitMs: number): Promise<DigestOutcome> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const wait = new Promise<DigestOutcome>(res => { timer = setTimeout(() => res({ ok: false, reason: 'waiting' }), Math.max(0, waitMs)) })
    try {
        return await Promise.race([p, wait])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

/** 응답을 보낸 뒤에도 서버가 이 일을 끝까지 하게 한다(Next after). 요청 밖(시험)에서는 조용히 넘어간다 */
export async function keepAlive(p: Promise<unknown>): Promise<void> {
    try {
        const { after } = await import('next/server')
        after(() => p.then(() => undefined, () => undefined))
    } catch { /* 요청 밖 */ }
}
