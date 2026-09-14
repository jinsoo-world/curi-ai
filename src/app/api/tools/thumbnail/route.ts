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

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const 손님하루한도 = 3

/** &, <, > 가 그대로 들어가면 SVG 가 깨진다 */
function 안전하게(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 글자가 길면 줄을 나눈다. 한글은 글자폭이 고르게 넓어서 글자 수로 끊어도 된다 */
function 줄나눔(s: string, 한줄: number): string[] {
    const 낱말 = s.split(' ')
    const 줄: string[] = []
    let 지금 = ''
    for (const w of 낱말) {
        const 붙임 = 지금 ? `${지금} ${w}` : w
        if (붙임.length > 한줄 && 지금) { 줄.push(지금); 지금 = w } else { 지금 = 붙임 }
    }
    if (지금) 줄.push(지금)
    return 줄.slice(0, 3)
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const 손님 = !user

        const { placeId, lookId, title, subtitle } = await req.json()
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
                    { error: `오늘 무료로 만들 수 있는 ${손님하루한도}장을 다 썼어요. 회원가입하면 계속 만들 수 있어요.`, needLogin: true },
                    { status: 429 },
                )
            }
            await admin.from('guest_generations').insert({ ip, kind: 'thumbnail' })
        } else {
            const { data: row } = await admin.from('users').select('clovers').eq('id', user!.id).single()
            잔액 = row?.clovers ?? 0
            if (잔액 < THUMBNAIL_COST) {
                return NextResponse.json(
                    { error: `클로버가 ${THUMBNAIL_COST}개 필요해요. 지금 ${잔액}개 있습니다.`, needCharge: true },
                    { status: 402 },
                )
            }
            차감후 = 잔액 - THUMBNAIL_COST
            await admin.from('users').update({ clovers: 차감후 }).eq('id', user!.id)
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

            // 글자 얹기
            const W = place.w, H = place.h
            const 제목줄 = 줄나눔(제목, W > H ? 14 : 10)
            const 제목크기 = Math.round(W * (W > H ? 0.085 : 0.105))
            const 부제크기 = Math.round(제목크기 * 0.42)
            const 줄간격 = Math.round(제목크기 * 1.24)
            const 시작Y = Math.round(H * 0.5 - ((제목줄.length - 1) * 줄간격) / 2 + 제목크기 * 0.34)

            const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${look.shade}" stop-opacity="0"/>
      <stop offset="28%" stop-color="${look.shade}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${look.shade}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${Math.round(H * 0.24)}" width="${W}" height="${H}" fill="url(#g)"/>
  ${제목줄.map((l, i) => `<text x="${W / 2}" y="${시작Y + i * 줄간격}" text-anchor="middle"
      font-family="Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic, sans-serif"
      font-size="${제목크기}" font-weight="900" fill="${look.text}"
      letter-spacing="-${Math.round(제목크기 * 0.035)}">${안전하게(l)}</text>`).join('')}
  ${부제 ? `<text x="${W / 2}" y="${시작Y + 제목줄.length * 줄간격 + Math.round(부제크기 * 0.5)}" text-anchor="middle"
      font-family="Apple SD Gothic Neo, Noto Sans KR, Malgun Gothic, sans-serif"
      font-size="${부제크기}" font-weight="700" fill="${look.sub}">${안전하게(부제)}</text>` : ''}
</svg>`

            const 완성 = await sharp(배경)
                .resize(W, H, { fit: 'cover' })
                .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
                .png()
                .toBuffer()

            const 결과64 = 완성.toString('base64')

            if (손님) {
                const 흐림 = await sharp(완성).blur(12).jpeg({ quality: 72 }).toBuffer()
                return NextResponse.json({
                    success: true,
                    imageBase64: 흐림.toString('base64'),
                    preview: true,
                    needLogin: true,
                })
            }

            return NextResponse.json({ success: true, imageBase64: 결과64, preview: false, balance: 차감후 })
        } catch (genErr) {
            if (!손님) {
                await admin.from('users').update({ clovers: 잔액 }).eq('id', user!.id)
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
