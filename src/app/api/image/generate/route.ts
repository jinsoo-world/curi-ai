// /api/image/generate — AI 사진 만들기
//
// 대표 지시 2026-09-14 = ①코치 인물 이미지를 만든다 ②전문가 프로필 사진 기능을 넣는다
// 힉스필드·Replicate 없이 우리가 이미 쓰는 Gemini 키로 만든다.
//
// ⚠️ 지금은 어드민만 쓸 수 있다. 일반에 열기 전에 클로버 차감·횟수 제한을 붙여야 한다
//    (한 장 만들 때마다 돈이 나간다).
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { IMAGE_MODEL_FAST, IMAGE_MODEL_PRO } from '@/domains/studio/image-models'
import { ADMIN_IMAGE_ROUTE, checkImageCap, logImageGeneration } from '@/domains/studio/image-usage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 만들 수 있는 모델. 이름을 브라우저가 정하지 못하게 목록으로 묶는다 (첫째가 기본) */
const ALLOWED_MODELS = [IMAGE_MODEL_PRO, IMAGE_MODEL_FAST]
/**
 * 종료된 옛 이름은 같은 자리의 새 모델로 돌린다 (0928).
 *   gemini-3-pro-image-preview (2026-06-25 종료 대상) → 좋은 모델
 *   gemini-2.5-flash-image (2026-10-02 종료), imagen-4.0-generate-001 (2026-08-17 종료) → 빠른 모델
 */
const OLD_MODEL_NAMES: Record<string, string> = {
    'gemini-3-pro-image-preview': IMAGE_MODEL_PRO,
    'gemini-2.5-flash-image': IMAGE_MODEL_FAST,
    'imagen-4.0-generate-001': IMAGE_MODEL_FAST,
}

export async function POST(req: NextRequest) {
    // 지금은 어드민 전용. 일반 공개 전에 클로버 차감을 붙인다.
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    // 요청 횟수 제한(보안 C-1 9번): 시간당 10
    const rl = await checkRateLimit(createAdminClient(), rateLimitKey('image', auth.user?.id), 10, 3600)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('사진 만들기') }, { status: 429 })
    // 하루 한도: 어드민 IMAGE_ADMIN_DAILY(기본 30), 전체 IMAGE_GLOBAL_DAILY(기본 200)
    const 한도 = await checkImageCap(createAdminClient(), { route: ADMIN_IMAGE_ROUTE })
    if (한도) return NextResponse.json({ error: 한도 }, { status: 429 })
    const 시작 = Date.now()
    let 쓴모델 = IMAGE_MODEL_PRO

    try {
        const { prompt, model } = await req.json()
        if (typeof prompt !== 'string' || prompt.trim().length < 5) {
            return NextResponse.json({ error: '무엇을 만들지 적어주세요.' }, { status: 400 })
        }
        const asked = typeof model === 'string' ? (OLD_MODEL_NAMES[model] ?? model) : ''
        const useModel = ALLOWED_MODELS.includes(asked) ? asked : ALLOWED_MODELS[0]
        쓴모델 = useModel

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

        const r = await ai.models.generateContent({
            model: useModel,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        })
        const parts = r.candidates?.[0]?.content?.parts ?? []
        const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
        const 기록 = { route: ADMIN_IMAGE_ROUTE, model: useModel, userId: auth.user?.id ?? null, usageMetadata: r.usageMetadata, latencyMs: Date.now() - 시작, meta: { who: 'admin' } }
        if (!imgPart) {
            logImageGeneration({ ...기록, images: 0, ok: false, error: 'no image part' })
            return NextResponse.json({
                error: '사진이 안 왔어요(글만 왔습니다).',
                텍스트: parts.map((p: { text?: string }) => p.text).filter(Boolean).join(' ').slice(0, 300),
            }, { status: 502 })
        }
        logImageGeneration({ ...기록, images: 1, ok: true })
        return NextResponse.json({
            success: true,
            model: useModel,
            imageBase64: (imgPart as { inlineData: { data: string } }).inlineData.data,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : '사진을 만들지 못했어요.'
        console.error('[Image Generate]', msg)
        logImageGeneration({ route: ADMIN_IMAGE_ROUTE, model: 쓴모델, userId: auth.user?.id ?? null, images: 0, ok: false, error: msg, latencyMs: Date.now() - 시작, meta: { who: 'admin' } })
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
