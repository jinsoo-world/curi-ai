// /api/tools/profile-photo — 전문가 프로필 사진 만들기
//
// 대표 지시 2026-09-14 = 「전문가 수준의 프로필 사진 제작하는 기능도 넣어줘」
//
// 흐름 = 내 사진 1장 + 고른 분위기 → Gemini 이미지 모델 → 새 사진
// 클로버를 먼저 차감하고, 실패하면 되돌려준다.
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStyle, getBackdrop, isValidStyle, isValidBackdrop, buildPhotoPrompt } from '@/domains/studio/photo'
import { getModel, isValidModelId, DEFAULT_MODEL_ID } from '@/domains/studio/models'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
        }

        const { imageBase64, mimeType, styleId, backdropId, modelId } = await req.json()

        if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
            return NextResponse.json({ error: '사진을 올려주세요.' }, { status: 400 })
        }
        if (!isValidStyle(styleId) || !isValidBackdrop(backdropId)) {
            return NextResponse.json({ error: '차림새와 배경을 골라주세요.' }, { status: 400 })
        }

        // 모델은 우리 목록에 있는 것만. 브라우저가 아무 이름이나 넣지 못하게 한다.
        const model = getModel(isValidModelId(modelId) ? modelId : DEFAULT_MODEL_ID)!
        const PHOTO_COST = model.cost

        const admin = createAdminClient()

        // 잔액 확인 → 먼저 차감 (만들고 나서 차감하면 만들다 끊겼을 때 공짜가 된다)
        const { data: row } = await admin.from('users').select('clovers').eq('id', user.id).single()
        const 잔액 = row?.clovers ?? 0
        if (잔액 < PHOTO_COST) {
            return NextResponse.json(
                { error: `클로버가 ${PHOTO_COST}개 필요해요. 지금 ${잔액}개 있습니다.`, needCharge: true },
                { status: 402 },
            )
        }
        const 차감후 = 잔액 - PHOTO_COST
        await admin.from('users').update({ clovers: 차감후 }).eq('id', user.id)
        await admin.from('credit_transactions').insert({
            user_id: user.id,
            amount: -PHOTO_COST,
            balance_after: 차감후,
            type: 'chat_usage',
            description: `프로필 사진 만들기 (${model.label} · ${styleId}/${backdropId})`,
        })

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
            const prompt = buildPhotoPrompt(getStyle(styleId)!, getBackdrop(backdropId)!)

            const r = await ai.models.generateContent({
                model: model.engine,
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
                        { text: prompt },
                    ],
                }],
            })

            const parts = r.candidates?.[0]?.content?.parts ?? []
            const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
            if (!imgPart) {
                throw new Error('사진이 만들어지지 않았어요.')
            }

            return NextResponse.json({
                success: true,
                imageBase64: (imgPart as { inlineData: { data: string } }).inlineData.data,
                balance: 차감후,
            })
        } catch (genErr) {
            // 만들기에 실패하면 클로버를 되돌려준다
            await admin.from('users').update({ clovers: 잔액 }).eq('id', user.id)
            await admin.from('credit_transactions').insert({
                user_id: user.id,
                amount: PHOTO_COST,
                balance_after: 잔액,
                type: 'refund',
                description: '프로필 사진 만들기 실패 되돌림',
            })
            const msg = genErr instanceof Error ? genErr.message : '사진을 만들지 못했어요.'
            console.error('[ProfilePhoto]', msg)
            return NextResponse.json({ error: msg + ' 클로버는 돌려드렸어요.' }, { status: 502 })
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : '사진을 만들지 못했어요.'
        console.error('[ProfilePhoto] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
