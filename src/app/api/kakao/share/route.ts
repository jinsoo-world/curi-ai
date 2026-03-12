import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * 카카오톡 공유 웹훅
 * 카카오톡 공유 메시지가 수신자에게 성공적으로 전달되면 호출됨
 * 
 * 카카오 개발자 콘솔 → 웹훅 → 카카오톡 공유 웹훅 등록:
 * URL: https://www.curi-ai.com/api/kakao/share
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        console.log('[Kakao Share Webhook] Received:', JSON.stringify(body))

        const { user_id, template_id, receiver_type, receiver_id } = body

        // Supabase에 공유 이벤트 기록
        const supabase = await createClient()

        await supabase.from('kakao_share_logs').insert({
            kakao_user_id: String(user_id),
            template_id: template_id || null,
            receiver_type: receiver_type || null,
            receiver_id: receiver_id || null,
            raw_payload: body,
            created_at: new Date().toISOString(),
        })

        console.log(`[Kakao Share Webhook] 공유 이벤트 기록 완료: user_id=${user_id}`)

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        console.error('[Kakao Share Webhook] Error:', error)
        // 카카오 웹훅은 200을 반환해야 재시도하지 않음
        return NextResponse.json({ status: 'ok' })
    }
}
