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
import { getStyle, getBackdrop, isValidStyle, isValidBackdrop, buildPhotoPrompt, getAge, isValidAgeId, DEFAULT_AGE_ID, getPurpose, isValidPurpose } from '@/domains/studio/photo'
import { getMood, getTone, isValidMood, isValidTone, buildInstaPrompt } from '@/domains/studio/insta'
import { getActorMood, getActorBackdrop, isValidActorMood, isValidActorBackdrop, buildActorPrompt } from '@/domains/studio/actor'
import { getModel, isValidModelId, DEFAULT_MODEL_ID } from '@/domains/studio/models'
import { getRatio, isValidRatioId, DEFAULT_RATIO_ID } from '@/domains/studio/ratios'
import sharp from 'sharp'

/** 로그인 안 한 사람이 하루에 만들 수 있는 장수 (같은 인터넷 주소 기준) */
const 손님하루한도 = 3

/**
 * 손님에게 주는 사진은 흐리게 만든다 — 대표 지시 2026-09-14
 * 「비회원도 이미지 생성은 가능하게 해. 근데 나오는 거를 흐릿하게 해. 다운받으려면 로그인 유도하고」
 *
 * 화면에서 CSS 로만 흐리게 하면 개발자도구로 한 번에 벗겨진다.
 * 그래서 서버에서 아예 흐린 그림을 만들어 보낸다. 원본은 보내지 않는다.
 */
async function 흐리게(base64: string): Promise<string> {
    const 원본 = Buffer.from(base64, 'base64')
    const 흐림 = await sharp(원본)
        .blur(14)
        .modulate({ saturation: 0.9 })
        .jpeg({ quality: 72 })
        .toBuffer()
    return 흐림.toString('base64')
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const 손님 = !user

        const { imageBase64, mimeType, styleId, backdropId, modelId, kind, ratioId, ageId, freeText, purposeId } = await req.json()

        if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
            return NextResponse.json({ error: '사진을 올려주세요.' }, { status: 400 })
        }
        // 세 가지를 만든다 — 재취업용(기본) · 인스타용 · 배우용
        const isInsta = kind === 'insta'
        const isActor = kind === 'actor'
        if (isInsta) {
            if (!isValidMood(styleId) || !isValidTone(backdropId)) {
                return NextResponse.json({ error: '분위기와 배경색을 골라주세요.' }, { status: 400 })
            }
        } else if (isActor) {
            if (!isValidActorMood(styleId) || !isValidActorBackdrop(backdropId)) {
                return NextResponse.json({ error: '느낌과 바탕을 골라주세요.' }, { status: 400 })
            }
        } else if (!isValidStyle(styleId) || !isValidBackdrop(backdropId)) {
            return NextResponse.json({ error: '차림새와 배경을 골라주세요.' }, { status: 400 })
        }

        // 모델은 우리 목록에 있는 것만. 브라우저가 아무 이름이나 넣지 못하게 한다.
        const model = getModel(isValidModelId(modelId) ? modelId : DEFAULT_MODEL_ID)!
        // 인스타는 항상 정사각형이다(동그랗게 잘려 보이니까). 나머지는 고른 대로.
        const ratio = getRatio(kind === 'insta' ? 'square' : (isValidRatioId(ratioId) ? ratioId : DEFAULT_RATIO_ID))!
        const PHOTO_COST = model.cost

        const admin = createAdminClient()
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

        let 잔액 = 0
        let 차감후 = 0

        if (손님) {
            // 손님은 클로버를 쓰지 않는다. 대신 같은 인터넷 주소로 하루 몇 장까지만.
            const 하루전 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const { count } = await admin
                .from('guest_generations')
                .select('id', { count: 'exact', head: true })
                .eq('ip', ip)
                .gte('created_at', 하루전)
            if ((count ?? 0) >= 손님하루한도) {
                return NextResponse.json(
                    { error: `오늘 무료로 만들 수 있는 ${손님하루한도}장을 다 썼어요. 회원가입하면 계속 만들 수 있어요.`, needLogin: true },
                    { status: 429 },
                )
            }
            await admin.from('guest_generations').insert({ ip, kind: isInsta ? 'insta' : 'photo' })
        } else {
            // 잔액 확인 → 먼저 차감 (만들고 나서 차감하면 만들다 끊겼을 때 공짜가 된다)
            const { data: row } = await admin.from('users').select('clovers').eq('id', user!.id).single()
            잔액 = row?.clovers ?? 0
            if (잔액 < PHOTO_COST) {
                return NextResponse.json(
                    { error: `클로버가 ${PHOTO_COST}개 필요해요. 지금 ${잔액}개 있습니다.`, needCharge: true },
                    { status: 402 },
                )
            }
            차감후 = 잔액 - PHOTO_COST
            await admin.from('users').update({ clovers: 차감후 }).eq('id', user!.id)
            await admin.from('credit_transactions').insert({
                user_id: user!.id,
                amount: -PHOTO_COST,
                balance_after: 차감후,
                type: 'chat_usage',
                description: `${isInsta ? '인스타' : isActor ? '배우' : '재취업'} 프로필 사진 (${model.label} · ${ratio.label} · ${styleId}/${backdropId})`,
            })
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
            const 나이 = getAge(isValidAgeId(ageId) ? ageId : DEFAULT_AGE_ID)!.minus
            const prompt = isInsta
                ? buildInstaPrompt(getMood(styleId)!, getTone(backdropId)!, typeof freeText === 'string' ? freeText : '')
                : isActor
                ? buildActorPrompt(getActorMood(styleId)!, getActorBackdrop(backdropId)!, ratio.label, 나이)
                : buildPhotoPrompt(
                    getStyle(styleId)!,
                    getBackdrop(backdropId)!,
                    ratio.label,
                    getAge(isValidAgeId(ageId) ? ageId : DEFAULT_AGE_ID)!.minus,
                  )

            const r = await ai.models.generateContent({
                model: model.engine,
                config: { imageConfig: { aspectRatio: ratio.value } },
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

            const 원본64 = (imgPart as { inlineData: { data: string } }).inlineData.data

            // 손님에게는 흐린 그림만 보낸다. 내려받으려면 로그인해야 한다.
            if (손님) {
                return NextResponse.json({
                    success: true,
                    imageBase64: await 흐리게(원본64),
                    preview: true,
                    needLogin: true,
                })
            }

            return NextResponse.json({
                success: true,
                imageBase64: 원본64,
                preview: false,
                balance: 차감후,
            })
        } catch (genErr) {
            // 만들기에 실패하면 클로버를 되돌려준다 (손님은 쓴 게 없다)
            if (!손님) {
                await admin.from('users').update({ clovers: 잔액 }).eq('id', user!.id)
                await admin.from('credit_transactions').insert({
                    user_id: user!.id,
                    amount: PHOTO_COST,
                    balance_after: 잔액,
                    type: 'refund',
                    description: '프로필 사진 만들기 실패 되돌림',
                })
            }
            const msg = genErr instanceof Error ? genErr.message : '사진을 만들지 못했어요.'
            console.error('[ProfilePhoto]', msg)
            return NextResponse.json({ error: msg + (손님 ? '' : ' 클로버는 돌려드렸어요.') }, { status: 502 })
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : '사진을 만들지 못했어요.'
        console.error('[ProfilePhoto] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
