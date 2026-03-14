import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import {
    detectEarlyExit,
    detectLongSession,
    type SignalType,
} from '@/domains/chat/signals'

export const dynamic = 'force-dynamic'

/**
 * POST /api/signals — 대화 신호 저장
 * 프론트에서 세션 종료 시 호출 (조기 이탈, 긴 대화 등)
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { sessionId, mentorId, messageCount, signalType, signalData } = await request.json()

        if (!sessionId || !mentorId) {
            return NextResponse.json({ error: 'sessionId와 mentorId가 필요합니다.' }, { status: 400 })
        }

        // 서비스 롤 클라이언트 (RLS 우회)
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 명시적 신호 타입이 지정된 경우 바로 저장
        if (signalType) {
            await admin.from('conversation_signals').insert({
                session_id: sessionId,
                mentor_id: mentorId,
                user_id: user.id,
                signal_type: signalType as SignalType,
                signal_data: signalData || {},
            })
            return NextResponse.json({ ok: true, signal: signalType })
        }

        // 자동 감지: 세션 종료 시 messageCount 기반
        if (typeof messageCount === 'number') {
            const signals: string[] = []

            // 조기 이탈 감지
            const earlyExit = await detectEarlyExit(
                admin, sessionId, mentorId, user.id, messageCount
            )
            if (earlyExit) signals.push('early_exit')

            // 긴 대화 감지
            const longSession = await detectLongSession(
                admin, sessionId, mentorId, user.id, messageCount
            )
            if (longSession) signals.push('long_session')

            return NextResponse.json({ ok: true, signals })
        }

        return NextResponse.json({ ok: true, signals: [] })
    } catch (error: any) {
        console.error('[Signals API] POST error:', error)
        return NextResponse.json(
            { error: error?.message || '신호 저장 중 오류' },
            { status: 500 }
        )
    }
}
