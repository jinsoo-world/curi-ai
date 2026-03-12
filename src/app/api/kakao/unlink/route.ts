import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * 카카오 연결 해제 웹훅
 * 사용자가 카카오에서 서비스 연결을 해제하면 호출됨
 * 
 * 카카오 개발자 콘솔 → 웹훅 → 연결 해제 웹훅 등록:
 * URL: https://www.curi-ai.com/api/kakao/unlink
 * 메서드: GET 또는 POST 선택 가능
 */

async function handleUnlink(kakaoUserId: string, referrerType: string | null, rawPayload: Record<string, unknown>) {
    const supabase = await createClient()

    // 1) 연결 해제 이벤트 기록
    await supabase.from('kakao_unlink_logs').insert({
        kakao_user_id: kakaoUserId,
        referrer_type: referrerType,
        raw_payload: rawPayload,
        created_at: new Date().toISOString(),
    })

    console.log(`[Kakao Unlink Webhook] 연결 해제 이벤트 기록 완료: kakao_user_id=${kakaoUserId}`)
}

// GET 방식 웹훅
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const userId = searchParams.get('user_id') || ''
        const referrerType = searchParams.get('referrer_type')

        console.log(`[Kakao Unlink Webhook GET] user_id=${userId}`)

        await handleUnlink(userId, referrerType, Object.fromEntries(searchParams.entries()))

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        console.error('[Kakao Unlink Webhook GET] Error:', error)
        return NextResponse.json({ status: 'ok' })
    }
}

// POST 방식 웹훅
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        console.log('[Kakao Unlink Webhook POST] Received:', JSON.stringify(body))

        const { user_id, referrer_type } = body

        await handleUnlink(String(user_id), referrer_type || null, body)

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        console.error('[Kakao Unlink Webhook POST] Error:', error)
        return NextResponse.json({ status: 'ok' })
    }
}
