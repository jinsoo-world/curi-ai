// /api/tools/thumbnail — 썸네일 만들기
//
// 대표 확정 2026-09-15 「썸네일 만들기 (유튜브, 어울림, 멤버십, 디콘 등)」
//
// 글자는 AI 에게 맡기지 않는다. 한글을 그리게 하면 자음·모음이 깨져서 못 쓴다.
// AI 는 배경만 만들고, 제목은 여기서 SVG 로 또렷하게 얹는다.
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    getThumbPlace, getThumbLook, isValidThumbPlace, isValidThumbLook,
    buildThumbnailPrompt, cleanLine, THUMBNAIL_COST, MAX_TITLE, MAX_SUB,
} from '@/domains/studio/thumbnail'
import { 사진보관 } from '@/lib/photo-store'
import { 손님잔액 } from '@/lib/guest-clover'
import { SIGNUP_CLOVERS } from '@/domains/trial'

export const dynamic = 'force-dynamic'
export const maxDuration = 60


export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const 손님 = !user

        const { placeId, lookId, title, subtitle, 표식: 받은표식 } = await req.json()
        if (!isValidThumbPlace(placeId) || !isValidThumbLook(lookId)) {
            return NextResponse.json({ error: '쓸 곳과 느낌을 골라주세요.' }, { status: 400 })
        }
        const 제목 = cleanLine(title, MAX_TITLE)
        const 부제 = cleanLine(subtitle, MAX_SUB)
        if (!제목) {
            return NextResponse.json({ error: '제목을 적어주세요.' }, { status: 400 })
        }

        const place = getThumbPlace(placeId)!
        const look = getThumbLook(lookId)!

        const admin = createAdminClient()
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
            // 같은 와이파이의 다른 사람이 막히지 않게, 브라우저 표식도 같이 본다 (전수조사 26번)
            const 표식 = typeof 받은표식 === 'string' && 받은표식.length > 8 ? 받은표식.slice(0, 64) : null

        let 잔액 = 0
        let 차감후 = 0
        let 남은값 = 0

        if (손님) {
            남은값 = await 손님잔액(ip, 표식)
            if (남은값 < THUMBNAIL_COST) {
                return NextResponse.json(
                    { error: `오늘 쓸 수 있는 클로버를 다 쓰셨어요. 회원가입하시면 ${SIGNUP_CLOVERS}개를 더 드립니다.`, needLogin: true },
                    { status: 429 },
                )
            }
            await admin.from('guest_generations').insert({ ip, fingerprint: 표식, kind: 'thumbnail', cost: THUMBNAIL_COST })
        } else {
            const { data: 남은 } = await admin.rpc('클로버_차감', { 그사람: user!.id, 낼값: THUMBNAIL_COST })
            if (남은 === null || 남은 < 0) {
                const { data: now } = await admin.from('users').select('clovers').eq('id', user!.id).single()
                잔액 = now?.clovers ?? 0
                return NextResponse.json(
                    { error: `클로버가 ${THUMBNAIL_COST}개 필요해요. 지금 ${잔액}개 있습니다.`, needCharge: true },
                    { status: 402 },
                )
            }
            차감후 = 남은 as number
            잔액 = 차감후 + THUMBNAIL_COST
            await admin.from('credit_transactions').insert({
                user_id: user!.id,
                amount: -THUMBNAIL_COST,
                balance_after: 차감후,
                type: 'chat_usage',
                description: `썸네일 (${place.label} · ${look.label})`,
            })
        }

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
            const r = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                config: { imageConfig: { aspectRatio: place.ratio } },
                contents: [{ role: 'user', parts: [{ text: buildThumbnailPrompt(look, place) }] }],
            })

            const parts = r.candidates?.[0]?.content?.parts ?? []
            const imgPart = parts.find((p: { inlineData?: { data?: string } }) => p.inlineData?.data)
            if (!imgPart) throw new Error('썸네일을 만들지 못했어요.')

            const 배경 = Buffer.from((imgPart as { inlineData: { data: string } }).inlineData.data, 'base64')

            // ⚠️ 글자는 여기서 얹지 않는다.
            // 2026-09-15 배포 서버에서 「가나다라마바사」가 네모 한 덩어리로 찍혔다.
            // Vercel 리눅스에 한글 폰트가 없고, sharp 의 SVG 렌더러는 시스템 폰트만 본다.
            // 그래서 배경만 만들어 보내고 제목은 브라우저 canvas 로 얹는다(거기엔 한글 폰트가 있다).
            const 완성 = await sharp(배경)
                .resize(place.w, place.h, { fit: 'cover' })
                .png()
                .toBuffer()

            const 결과64 = 완성.toString('base64')

            const 글자값 = {
                title: 제목,
                subtitle: 부제,
                width: place.w,
                height: place.h,
                textColor: look.text,
                subColor: look.sub,
                shade: look.shade,
            }

            const 보관 = await 사진보관(결과64, 'thumbnail', 손님 ? null : user!.id)

            if (손님) {
                const 흐림 = await sharp(완성).blur(12).jpeg({ quality: 72 }).toBuffer()
                return NextResponse.json({
                    success: true,
                    imageBase64: 흐림.toString('base64'),
                    preview: true,
                    needLogin: true,
                    text: 글자값,
                    claimToken: 보관?.claimToken ?? null,
                    balance: Math.max(0, 남은값 - THUMBNAIL_COST),
                })
            }

            return NextResponse.json({ success: true, imageBase64: 보관?.url ? undefined : 결과64, url: 보관?.url ?? null, preview: false, balance: 차감후, text: 글자값 })
        } catch (genErr) {
            if (!손님) {
                await admin.rpc('클로버_더하기', { 그사람: user!.id, 더할값: THUMBNAIL_COST })
                await admin.from('credit_transactions').insert({
                    user_id: user!.id,
                    amount: THUMBNAIL_COST,
                    balance_after: 잔액,
                    type: 'refund',
                    description: '썸네일 만들기 실패 되돌림',
                })
            }
            const msg = genErr instanceof Error ? genErr.message : '썸네일을 만들지 못했어요.'
            console.error('[Thumbnail]', msg)
            return NextResponse.json({ error: msg + (손님 ? '' : ' 클로버는 돌려드렸어요.') }, { status: 502 })
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : '썸네일을 만들지 못했어요.'
        console.error('[Thumbnail] Error:', msg)
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
