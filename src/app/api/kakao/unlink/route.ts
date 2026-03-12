import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * 카카오 연결 해제 웹훅
 * 사용자가 카카오에서 서비스 연결을 해제하면 호출됨
 * 
 * 카카오 개발자 콘솔 → 웹훅 → 연결 해제 웹훅 등록:
 * URL: https://www.curi-ai.com/api/kakao/unlink
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        console.log('[Kakao Unlink Webhook] Received:', JSON.stringify(body))

        const { user_id, referrer_type } = body
        const kakaoUserId = String(user_id)

        const supabase = await createClient()

        // 1) 연결 해제 이벤트 기록
        await supabase.from('kakao_unlink_logs').insert({
            kakao_user_id: kakaoUserId,
            referrer_type: referrer_type || null,
            raw_payload: body,
            created_at: new Date().toISOString(),
        })

        // 2) 해당 카카오 유저의 프로필에서 연결 해제 상태 업데이트
        //    (카카오 user_id로 프로필 찾아서 비활성화)
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id')
            .eq('kakao_id', kakaoUserId)

        if (profiles && profiles.length > 0) {
            for (const profile of profiles) {
                await supabase
                    .from('profiles')
                    .update({
                        kakao_linked: false,
                        kakao_unlinked_at: new Date().toISOString(),
                    })
                    .eq('id', profile.id)
            }
            console.log(`[Kakao Unlink Webhook] ${profiles.length}개 프로필 연결 해제 처리 완료`)
        } else {
            console.log(`[Kakao Unlink Webhook] kakao_user_id=${kakaoUserId}에 해당하는 프로필 없음`)
        }

        return NextResponse.json({ status: 'ok' })
    } catch (error) {
        console.error('[Kakao Unlink Webhook] Error:', error)
        // 카카오 웹훅은 200을 반환해야 재시도하지 않음
        return NextResponse.json({ status: 'ok' })
    }
}
