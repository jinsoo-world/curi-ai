// domains/llm = 곁일(기억 뽑기, 대화 제목, 추천 질문, 요약, 자막 교정, 먼저 말 걸기, 멘토 추천) 한 입구.
//
// 스위치 하나: SIDE_TEXT_PROVIDER
//   gemini (기본) = 지금처럼 각자 쓰던 Gemini 모델로 부른다.
//   solar         = 솔라 미니(solar-mini4)로 먼저 부르고, 안 되면 원래 Gemini 로 되돌아간다.
// 어느 쪽이든 llm_usage 에 한 줄 남긴다 (누가 답했나, 되돌아간 까닭).
// 사진이 들어가는 일, 유튜브 영상, 사진 만들기는 여기로 오지 않는다 (Gemini 만 한다).

import { GoogleGenAI } from '@google/genai'
import { solarChatStream } from './solar'
import { SOLAR_MINI_MODEL } from './constants'
import { logLlmUsage, geminiTokens } from './usage-log'
import { classifyFallbackReason } from './fallback-reason'
import type { FallbackReason } from './fallback-reason'

export type SideProvider = 'gemini' | 'solar'

/** 곁일 Gemini 마감 (2026-10-06 멈춤 점검). 넘기면 던지고, 호출 쪽이 원래 하던 대로 넘어간다 */
export const SIDE_TEXT_GEMINI_TIMEOUT_MS = 8_000

export function sideTextProvider(env: Record<string, string | undefined> = process.env): SideProvider {
    return String(env.SIDE_TEXT_PROVIDER ?? '').trim().toLowerCase() === 'solar' ? 'solar' : 'gemini'
}

export interface SideTextRequest {
    /** memory, topic, suggestions, summary, vtt, proactive, mentor-match 등 */
    kind: string
    route: string
    userId?: string | null
    mentorId?: string | null
    meta?: Record<string, unknown> | null
    /** 사용자 차례 글 (지시문이 여기 다 들어 있어도 된다) */
    prompt: string
    /** 따로 줄 시스템 지시 (없으면 비움) */
    system?: string
    /** 원래 쓰던 Gemini 모델 */
    geminiModel: string
    temperature?: number
    /** 두 쪽 다 쓰는 답 길이 상한 (토큰). 안 주면 Gemini 는 모델 기본값 */
    maxTokens?: number
    /** 솔라만 쓰는 답 길이 상한. 안 주면 maxTokens, 그것도 없으면 512 */
    solarMaxTokens?: number
    /** 솔라를 기다릴 최대 시간. 넘으면 Gemini 로 */
    solarTimeoutMs?: number
    /** Gemini 를 기다릴 최대 시간. 안 주면 8초, 단 solarTimeoutMs 를 더 길게 준 일(요약·초안 등 긴 일)은 그 값 */
    geminiTimeoutMs?: number
}

/** 곁일 하나를 묻고 글만 돌려받는다. 둘 다 안 되면 null (호출 쪽이 원래 하던 대로 넘어간다) */
export async function askSideText(req: SideTextRequest): Promise<string | null> {
    const base = { route: req.route, userId: req.userId ?? null, mentorId: req.mentorId ?? null, kind: req.kind }
    let reason: FallbackReason | null = null
    let solarError: string | null = null

    if (sideTextProvider() === 'solar') {
        if (!process.env.UPSTAGE_API_KEY) {
            reason = 'missing_key'
        } else {
            const started = Date.now()
            let ttft: number | null = null
            let usage: { prompt: number; completion: number } | null = null
            try {
                let out = ''
                for await (const chunk of solarChatStream(req.system ?? '', [{ role: 'user', content: req.prompt }], {
                    model: SOLAR_MINI_MODEL,
                    temperature: req.temperature ?? 0.2,
                    maxTokens: req.solarMaxTokens ?? req.maxTokens ?? 512,
                    signal: AbortSignal.timeout(req.solarTimeoutMs ?? 8_000),
                })) {
                    if (chunk.text) {
                        if (ttft === null) ttft = Date.now() - started
                        out += chunk.text
                    }
                    if (chunk.done && chunk.usage) usage = chunk.usage
                }
                const text = out.trim()
                logLlmUsage({
                    ...base, provider: 'solar', model: SOLAR_MINI_MODEL,
                    inputTokens: usage?.prompt ?? null, outputTokens: usage?.completion ?? null,
                    ttftMs: ttft, latencyMs: Date.now() - started, ok: !!text, meta: req.meta ?? null,
                })
                if (text) return text
                reason = 'empty'
            } catch (e) {
                reason = classifyFallbackReason(e)
                solarError = e instanceof Error ? e.message : String(e)
                console.warn(`[side-text] ${req.kind} 솔라 실패(${reason}), Gemini 로:`, solarError.slice(0, 160))
            }
        }
    }

    if (!process.env.GEMINI_API_KEY) return null
    const started = Date.now()
    const meta = { ...(req.meta ?? {}), ...(solarError ? { solarError: solarError.slice(0, 200) } : {}) }
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const res = await ai.models.generateContent({
            model: req.geminiModel,
            config: {
                ...(req.system ? { systemInstruction: req.system } : {}),
                ...(typeof req.temperature === 'number' ? { temperature: req.temperature } : {}),
                ...(typeof req.maxTokens === 'number' ? { maxOutputTokens: req.maxTokens } : {}),
                abortSignal: AbortSignal.timeout(req.geminiTimeoutMs ?? Math.max(SIDE_TEXT_GEMINI_TIMEOUT_MS, req.solarTimeoutMs ?? 0)),
            },
            contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        })
        const t = geminiTokens(res.usageMetadata)
        logLlmUsage({
            ...base, provider: 'gemini', model: req.geminiModel,
            inputTokens: t.input, outputTokens: t.output, latencyMs: Date.now() - started,
            fallback: reason !== null, fallbackReason: reason,
            meta: Object.keys(meta).length ? meta : null,
        })
        return (res.text ?? '').trim() || null
    } catch (e) {
        logLlmUsage({
            ...base, provider: 'gemini', model: req.geminiModel, latencyMs: Date.now() - started,
            fallback: reason !== null, fallbackReason: reason, ok: false,
            error: e instanceof Error ? e.message : String(e), meta: Object.keys(meta).length ? meta : null,
        })
        throw e
    }
}
