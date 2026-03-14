import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 무료체험 한도: 총 180초 (3분)
const FREE_TRIAL_LIMIT_SECONDS = 180

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

        // voice_usage 테이블에서 누적 사용량 조회
        const { data, error } = await supabase
            .from('voice_usage')
            .select('total_seconds')
            .eq('user_id', user.id)
            .single()

        const totalSeconds = data?.total_seconds || 0
        const remainingSeconds = Math.max(0, FREE_TRIAL_LIMIT_SECONDS - totalSeconds)

        return NextResponse.json({
            totalSeconds,
            remainingSeconds,
            limitSeconds: FREE_TRIAL_LIMIT_SECONDS,
            expired: remainingSeconds <= 0,
        })
    } catch (e: any) {
        console.error('[Voice Usage] GET error:', e)
        return NextResponse.json({ error: '서버 오류' }, { status: 500 })
    }
}

// 통화 종료 시 사용량 업데이트
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

        const { secondsUsed } = await request.json()
        if (typeof secondsUsed !== 'number' || secondsUsed < 0) {
            return NextResponse.json({ error: 'secondsUsed 필요' }, { status: 400 })
        }

        // upsert: 있으면 업데이트, 없으면 생성
        const { data: existing } = await supabase
            .from('voice_usage')
            .select('total_seconds')
            .eq('user_id', user.id)
            .single()

        let totalSeconds: number

        if (existing) {
            totalSeconds = existing.total_seconds + secondsUsed
            await supabase
                .from('voice_usage')
                .update({ total_seconds: totalSeconds, updated_at: new Date().toISOString() })
                .eq('user_id', user.id)
        } else {
            totalSeconds = secondsUsed
            await supabase
                .from('voice_usage')
                .insert({ user_id: user.id, total_seconds: totalSeconds })
        }

        const remainingSeconds = Math.max(0, FREE_TRIAL_LIMIT_SECONDS - totalSeconds)

        console.log(`[Voice Usage] 사용자 ${user.id}: +${secondsUsed}초, 누적 ${totalSeconds}초, 남은 ${remainingSeconds}초`)

        return NextResponse.json({
            totalSeconds,
            remainingSeconds,
            limitSeconds: FREE_TRIAL_LIMIT_SECONDS,
            expired: remainingSeconds <= 0,
        })
    } catch (e: any) {
        console.error('[Voice Usage] POST error:', e)
        return NextResponse.json({ error: '서버 오류' }, { status: 500 })
    }
}
