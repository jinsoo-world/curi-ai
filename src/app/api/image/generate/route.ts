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

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 만들 수 있는 모델 — 이름을 브라우저가 정하지 못하게 목록으로 묶는다 */
const ALLOWED_MODELS = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image', 'imagen-4.0-generate-001']

export async function POST(req: NextRequest) {
    // 지금은 어드민 전용. 일반 공개 전에 클로버 차감을 붙인다.
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    try {
        const { prompt, model } = await req.json()
        if (typeof prompt !== 'string' || prompt.trim().length < 5) {
            return NextResponse.json({ error: '무엇을 만들지 적어주세요.' }, { status: 400 })
        }
        const useModel = ALLOWED_MODELS.includes(model) ? model : ALLOWED_MODELS[0]

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

        // 두 갈래 — imagen 계열은 generateImages, gemini 계열은 generateContent
        if (useModel.startsWith('imagen')) {
            const r = await ai.models.generateImages({
                model: useModel,
                prompt,
                config: { numberOfImages: 1 },
            })
            const img = r.generatedImages?.[0]?.image?.imageBytes
            if (!img) return NextResponse.json({ error: '사진을 만들지 못했어요.', raw: JSON.stringify(r).slice(0, 400) }, { status: 502 })
            return NextResponse.json({ success: true, model: useModel, imageBase64: img })
        }

        const r = await ai.models.generateContent({
            model: useModel,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        })
        const parts = r.candidates?.[0]?.content?.parts ?? []
        const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
        if (!imgPart) {
            return NextResponse.json({
                error: '사진이 안 왔어요(글만 왔습니다).',
                텍스트: parts.map((p: { text?: string }) => p.text).filter(Boolean).join(' ').slice(0, 300),
            }, { status: 502 })
        }
        return NextResponse.json({
            success: true,
            model: useModel,
            imageBase64: (imgPart as { inlineData: { data: string } }).inlineData.data,
        })
    } catch (error) {
        const msg = error instanceof Error ? error.message : '사진을 만들지 못했어요.'
        console.error('[Image Generate]', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
