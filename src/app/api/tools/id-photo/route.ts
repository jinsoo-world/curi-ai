// /api/tools/id-photo — 증명사진 만들기 (대표 확정 2026-09-15)
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    getIdBackground, getIdOutfit, getIdSize, getIdHair, isValidIdHair, DEFAULT_HAIR_ID,
    isValidIdBackground, isValidIdOutfit, isValidIdSize,
    buildIdPhotoPrompt, ID_COST,
} from '@/domains/studio/idphoto'
import { getAge, isValidAgeId, DEFAULT_AGE_ID } from '@/domains/studio/photo'
import { getModel, isValidModelId, DEFAULT_MODEL_ID } from '@/domains/studio/models'
import { 사진보관 } from '@/lib/photo-store'
import { 손님잔액 } from '@/lib/guest-clover'
import { SIGNUP_CLOVERS } from '@/domains/trial'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


async function 흐리게(base64: string): Promise<string> {
    const b = await sharp(Buffer.from(base64, 'base64')).blur(14).jpeg({ quality: 72 }).toBuffer()
    return b.toString('base64')
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const 손님 = !user

        const { imageBase64, mimeType, backgroundId, outfitId, sizeId, ageId, modelId, hairId, 표식: 받은표식, 옵션요약: 받은옵션 } = await req.json()
        // 보관함에 보여줄 「어떤 옵션으로 만들었나」 — 화면이 만들어 보낸다 (대표 지시 2026-09-16)
        const 옵션요약: string | null = typeof 받은옵션 === 'string' ? 받은옵션.slice(0, 120) : null
        if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
            return NextResponse.json({ error: '사진을 올려주세요.' }, { status: 400 })
        }
        if (!isValidIdBackground(backgroundId) || !isValidIdOutfit(outfitId) || !isValidIdSize(sizeId)) {
            return NextResponse.json({ error: '배경·차림새·규격을 골라주세요.' }, { status: 400 })
        }

        const bg = getIdBackground(backgroundId)!
        const outfit = getIdOutfit(outfitId)!
        const size = getIdSize(sizeId)!
        const model = getModel(isValidModelId(modelId) ? modelId : DEFAULT_MODEL_ID)!
        const 나이 = getAge(isValidAgeId(ageId) ? ageId : DEFAULT_AGE_ID)!.minus
        const 머리 = getIdHair(isValidIdHair(hairId) ? hairId : DEFAULT_HAIR_ID)

        const admin = createAdminClient()
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
            // 같은 와이파이의 다른 사람이 막히지 않게, 브라우저 표식도 같이 본다 (전수조사 26번)
            const 표식 = typeof 받은표식 === 'string' && 받은표식.length > 8 ? 받은표식.slice(0, 64) : null

        let 잔액 = 0
        let 차감후 = 0
        let 남은값 = 0

        if (손님) {
            남은값 = await 손님잔액(ip, 표식)
            if (남은값 < ID_COST) {
                return NextResponse.json(
                    { error: `오늘 쓸 수 있는 클로버를 다 쓰셨어요. 회원가입하시면 ${SIGNUP_CLOVERS}개를 더 드립니다.`, needLogin: true },
                    { status: 429 },
                )
            }
            await admin.from('guest_generations').insert({ ip, fingerprint: 표식, kind: 'id-photo', cost: ID_COST })
        } else {
            const { data: 남은 } = await admin.rpc('클로버_차감', { 그사람: user!.id, 낼값: ID_COST })
            if (남은 === null || 남은 < 0) {
                const { data: now } = await admin.from('users').select('clovers').eq('id', user!.id).single()
                잔액 = now?.clovers ?? 0
                return NextResponse.json(
                    { error: `클로버가 ${ID_COST}개 필요해요. 지금 ${잔액}개 있습니다.`, needCharge: true },
                    { status: 402 },
                )
            }
            차감후 = 남은 as number
            잔액 = 차감후 + ID_COST
            await admin.from('credit_transactions').insert({
                user_id: user!.id,
                amount: -ID_COST,
                balance_after: 차감후,
                type: 'chat_usage',
                description: `증명사진 (${size.label} · ${bg.label})`,
            })
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
            const r = await ai.models.generateContent({
                model: model.engine,
                config: { imageConfig: { aspectRatio: size.ratio } },
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
                        { text: buildIdPhotoPrompt(bg, outfit, size, 나이, 머리) },
                    ],
                }],
            })

            const parts = r.candidates?.[0]?.content?.parts ?? []
            const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
            if (!imgPart) throw new Error('사진이 만들어지지 않았어요.')

            const 원본64 = (imgPart as { inlineData: { data: string } }).inlineData.data

            // 48시간 보관함에 넣는다. 비회원 것도 선명한 원본을 넣어두고
            // 「찾아가는 표」를 준다 — 로그인하면 방금 만든 사진을 그대로 받는다.
            const 보관 = await 사진보관(원본64, 'id-photo', 손님 ? null : user!.id, 'png', 옵션요약)

            if (손님) {
                return NextResponse.json({
                    success: true,
                    imageBase64: await 흐리게(원본64),
                    preview: true,
                    needLogin: true,
                    claimToken: 보관?.claimToken ?? null,
                    balance: Math.max(0, 남은값 - ID_COST),
                })
            }
            return NextResponse.json({
                success: true,
                imageBase64: 보관?.url ? undefined : 원본64,
                url: 보관?.url ?? null,
                preview: false,
                balance: 차감후,
            })
        } catch (genErr) {
            if (!손님) {
                await admin.rpc('클로버_더하기', { 그사람: user!.id, 더할값: ID_COST })
                await admin.from('credit_transactions').insert({
                    user_id: user!.id,
                    amount: ID_COST,
                    balance_after: 잔액,
                    type: 'refund',
                    description: '증명사진 만들기 실패 되돌림',
                })
            }
            const msg = genErr instanceof Error ? genErr.message : '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.'
            console.error('[IdPhoto]', msg)
            return NextResponse.json({ error: msg + (손님 ? '' : ' 클로버는 돌려드렸어요.') }, { status: 502 })
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : '사진을 만들지 못했어요. 얼굴이 크고 밝게 나온 사진으로 다시 해보세요.'
        console.error('[IdPhoto] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
