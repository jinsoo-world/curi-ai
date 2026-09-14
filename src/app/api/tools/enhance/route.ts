// /api/tools/enhance — 사진 화질 개선하기
//
// 대표 확정 2026-09-15. 값은 만들기(20개)보다 싸게 12개.
// 손님(로그인 안 한 사람)도 하루 3장까지 해보고, 결과는 흐리게 받는다.
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEnhanceMode, isValidEnhanceMode, buildEnhancePrompt, ENHANCE_COST } from '@/domains/studio/enhance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const 손님하루한도 = 3

async function 흐리게(base64: string): Promise<string> {
    const 흐림 = await sharp(Buffer.from(base64, 'base64'))
        .blur(14)
        .jpeg({ quality: 72 })
        .toBuffer()
    return 흐림.toString('base64')
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const 손님 = !user

        const { imageBase64, mimeType, modeId } = await req.json()
        if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
            return NextResponse.json({ error: '사진을 올려주세요.' }, { status: 400 })
        }
        if (!isValidEnhanceMode(modeId)) {
            return NextResponse.json({ error: '어떻게 고칠지 골라주세요.' }, { status: 400 })
        }
        const mode = getEnhanceMode(modeId)!

        const admin = createAdminClient()
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

        let 잔액 = 0
        let 차감후 = 0

        if (손님) {
            const 하루전 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const { count } = await admin
                .from('guest_generations')
                .select('id', { count: 'exact', head: true })
                .eq('ip', ip)
                .gte('created_at', 하루전)
            if ((count ?? 0) >= 손님하루한도) {
                return NextResponse.json(
                    { error: `오늘 무료로 해볼 수 있는 ${손님하루한도}장을 다 썼어요. 회원가입하면 계속 쓸 수 있어요.`, needLogin: true },
                    { status: 429 },
                )
            }
            await admin.from('guest_generations').insert({ ip, kind: 'enhance' })
        } else {
            const { data: row } = await admin.from('users').select('clovers').eq('id', user!.id).single()
            잔액 = row?.clovers ?? 0
            if (잔액 < ENHANCE_COST) {
                return NextResponse.json(
                    { error: `클로버가 ${ENHANCE_COST}개 필요해요. 지금 ${잔액}개 있습니다.`, needCharge: true },
                    { status: 402 },
                )
            }
            차감후 = 잔액 - ENHANCE_COST
            await admin.from('users').update({ clovers: 차감후 }).eq('id', user!.id)
            await admin.from('credit_transactions').insert({
                user_id: user!.id,
                amount: -ENHANCE_COST,
                balance_after: 차감후,
                type: 'chat_usage',
                description: `사진 화질 개선 (${mode.label})`,
            })
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
            const r = await ai.models.generateContent({
                model: 'gemini-3-pro-image-preview',
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } },
                        { text: buildEnhancePrompt(mode) },
                    ],
                }],
            })

            const parts = r.candidates?.[0]?.content?.parts ?? []
            const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
            if (!imgPart) throw new Error('사진을 고치지 못했어요.')

            const 원본64 = (imgPart as { inlineData: { data: string } }).inlineData.data

            if (손님) {
                return NextResponse.json({
                    success: true,
                    imageBase64: await 흐리게(원본64),
                    preview: true,
                    needLogin: true,
                })
            }

            return NextResponse.json({ success: true, imageBase64: 원본64, preview: false, balance: 차감후 })
        } catch (genErr) {
            if (!손님) {
                await admin.from('users').update({ clovers: 잔액 }).eq('id', user!.id)
                await admin.from('credit_transactions').insert({
                    user_id: user!.id,
                    amount: ENHANCE_COST,
                    balance_after: 잔액,
                    type: 'refund',
                    description: '사진 화질 개선 실패 되돌림',
                })
            }
            const msg = genErr instanceof Error ? genErr.message : '사진을 고치지 못했어요.'
            console.error('[Enhance]', msg)
            return NextResponse.json({ error: msg + (손님 ? '' : ' 클로버는 돌려드렸어요.') }, { status: 502 })
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : '사진을 고치지 못했어요.'
        console.error('[Enhance] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
