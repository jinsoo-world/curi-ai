// /api/missions/share — 공유 완료 시 10클로버 적립 (하루 최대 3회)
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
    try {
        const supabase = await createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // 오늘 공유 횟수 확인
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { data: todayShares } = await supabaseAdmin
            .from('credits')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'mission_share')
            .gte('created_at', today.toISOString())

        const sharesToday = todayShares?.length || 0

        if (sharesToday >= 3) {
            return NextResponse.json({
                ok: false,
                error: '오늘 공유 미션은 3회까지 가능합니다.',
                sharesToday,
            })
        }

        // 10 클로버 적립
        await supabaseAdmin.from('credits').insert({
            user_id: user.id,
            amount: 10,
            type: 'mission_share',
            description: `친구에게 공유하기 (${sharesToday + 1}/3)`,
        })

        // 최신 잔액 계산
        const { data: balanceData } = await supabaseAdmin
            .from('credits')
            .select('amount')
            .eq('user_id', user.id)
        const newBalance = (balanceData || []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)

        // users.clovers 동기화
        await supabaseAdmin.from('users').update({ clovers: newBalance }).eq('id', user.id)

        return NextResponse.json({
            ok: true,
            earned: 10,
            sharesToday: sharesToday + 1,
            clovers: newBalance,
        })
    } catch (err: unknown) {
        console.error('Share mission error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}
