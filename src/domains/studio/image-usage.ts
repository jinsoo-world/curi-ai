// 사진 만들기 한 번마다 비용 기록 + 하루 한도 (서버 전용)
//
// 한도 (대표 결정 0928):
//   IMAGE_GLOBAL_DAILY (기본 30, 2026-10-06 200→30) = 서비스 전체 하루 장수. 모든 사진 입구에 건다. 환경변수로 덮어쓴다.
//   IMAGE_ADMIN_DAILY  (기본 30)  = 어드민 사진 만들기(/api/image/generate) 하루 장수.
//   날짜는 한국 시간. llm_usage 에 성공으로 남은 kind image 줄의 장수를 센다.
// 기록: llm_usage 에 kind image, 모델, 사람(없으면 손님), 장수, 추정 원화(prices.ts 사진 가격표).

import type { SupabaseClient } from '@supabase/supabase-js'
import { logLlmUsage, geminiTokens } from '@/domains/llm/usage-log'
import { estimateImageCostKrw } from '@/domains/llm/prices'

export const ADMIN_IMAGE_ROUTE = '/api/image/generate'

export const IMAGE_CAP_TEXT_GLOBAL = '오늘 사진 만들기가 다 찼어요. 내일 다시 해주세요.'
export const IMAGE_CAP_TEXT_ADMIN = '오늘 어드민 사진 만들기 한도를 다 썼어요.'

function intEnv(v: string | undefined, fallback: number): number {
    if (v === undefined || v.trim() === '') return fallback   // 빈 값이 0(전부 막힘)이 되지 않게
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback
}

/** 서비스 전체 하루 사진 장수 기본값 (비용 상한. 환경변수 IMAGE_GLOBAL_DAILY 로 덮어쓴다) */
export const IMAGE_GLOBAL_DAILY_DEFAULT = 30

export function imageCaps(env: Record<string, string | undefined> = process.env): { global: number; admin: number } {
    return { global: intEnv(env.IMAGE_GLOBAL_DAILY, IMAGE_GLOBAL_DAILY_DEFAULT), admin: intEnv(env.IMAGE_ADMIN_DAILY, 30) }
}

/** 한도 판단만 (시험하기 쉽게 따로) */
export function capBlockText(counts: { global: number; admin?: number | null }, caps: { global: number; admin: number }, isAdminRoute: boolean): string | null {
    if (counts.global >= caps.global) return IMAGE_CAP_TEXT_GLOBAL
    if (isAdminRoute && typeof counts.admin === 'number' && counts.admin >= caps.admin) return IMAGE_CAP_TEXT_ADMIN
    return null
}

/**
 * 오늘 한도를 넘었으면 보여줄 한 줄, 아니면 null.
 * 세는 데 실패하면 막지 않는다 (사람별 클로버와 시간당 제한은 그대로 남아 있다).
 */
export async function checkImageCap(db: SupabaseClient, opts: { route: string }): Promise<string | null> {
    try {
        const isAdmin = opts.route === ADMIN_IMAGE_ROUTE
        const [g, a] = await Promise.all([
            db.rpc('llm_image_count_today', {}),
            isAdmin ? db.rpc('llm_image_count_today', { p_route: ADMIN_IMAGE_ROUTE }) : Promise.resolve({ data: null, error: null }),
        ])
        if (g.error) { console.warn('[image cap] 세기 실패:', g.error.message); return null }
        const text = capBlockText({ global: Number(g.data ?? 0), admin: a.data === null ? null : Number(a.data) }, imageCaps(), isAdmin)
        if (text) console.warn('[image cap] 막음', JSON.stringify({ route: opts.route, global: g.data, admin: a.data }))
        return text
    } catch (e) {
        console.warn('[image cap] 세기 실패:', e instanceof Error ? e.message : e)
        return null
    }
}

/** 사진 한 번 만든 기록. 실패해도 입력 토큰 값은 남긴다 (장수는 0) */
export function logImageGeneration(e: {
    route: string
    model: string
    userId?: string | null
    images: number
    ok: boolean
    usageMetadata?: unknown
    error?: string | null
    latencyMs?: number | null
    meta?: Record<string, unknown> | null
}): void {
    const t = geminiTokens(e.usageMetadata)
    const images = e.ok ? Math.max(0, e.images) : 0
    logLlmUsage({
        route: e.route, kind: 'image', provider: 'gemini', model: e.model,
        userId: e.userId ?? null,
        inputTokens: t.input, outputTokens: t.output,
        imageCount: images,
        costKrw: estimateImageCostKrw(e.model, images, t.input),
        latencyMs: e.latencyMs ?? null,
        ok: e.ok, error: e.error ?? null,
        meta: { who: e.userId ? 'user' : 'guest', ...(e.meta ?? {}) },
    })
}
