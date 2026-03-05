// /api/billing/history — 결제 내역 조회
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const browserClient = await createBrowserClient()
        const { data: { user } } = await browserClient.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 결제 내역 조회 (최근 20건)
        const { data: payments, error } = await supabase
            .from('payments')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) {
            console.error('[Billing] History error:', error.message)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // 현재 구독 정보
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['active', 'canceled'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        return NextResponse.json({
            payments: payments || [],
            subscription,
        })
    } catch (error: unknown) {
        console.error('[Billing] History error:', error)
        const message = error instanceof Error ? error.message : '결제 내역 조회 중 오류 발생'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
