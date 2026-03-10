import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
    try {
        const supabase = await createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // service_role로 RLS 우회해서 정확한 카운트 조회
        // 1) AI 몇 개 만들었는지
        const { count: aiCreated } = await supabaseAdmin
            .from('mentors')
            .select('*', { count: 'exact', head: true })
            .eq('created_by', user.id)

        // 2) 질문 횟수 (user role 메시지)
        const { count: questionsAsked } = await supabaseAdmin
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'user')
            .in('session_id', 
                // 본인 세션만
                (await supabaseAdmin
                    .from('chat_sessions')
                    .select('id')
                    .eq('user_id', user.id)
                ).data?.map(s => s.id) || []
            )

        // 3) 클로버 잔고 + referral_code
        const { data: profile } = await supabaseAdmin
            .from('users')
            .select('clovers, referral_code')
            .eq('id', user.id)
            .single()

        // 4) 친구 초대 수
        let friendsInvited = 0
        if (profile?.referral_code) {
            const { count } = await supabaseAdmin
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('referred_by', profile.referral_code)
            friendsInvited = count || 0
        }

        return NextResponse.json({
            ok: true,
            aiCreated: aiCreated || 0,
            questionsAsked: questionsAsked || 0,
            clovers: profile?.clovers || 0,
            referralCode: profile?.referral_code || '',
            friendsInvited,
        })
    } catch (err: unknown) {
        console.error('Mission status error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}
