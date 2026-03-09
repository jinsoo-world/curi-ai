// /api/creator/mentor/list — 내가 만든 멘토 목록
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL = 'jin@mission-driven.kr'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const isAdmin = user.email === ADMIN_EMAIL

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 어드민: 전체 멘토 (삭제된 것 제외)
        if (isAdmin) {
            const { data: mentors, error } = await admin
                .from('mentors')
                .select('id, name, title, mentor_type, status, is_active, created_at, creator_id')
                .neq('status', 'suspended')
                .order('created_at', { ascending: false })

            if (error) throw new Error(error.message)
            return NextResponse.json({ success: true, mentors: mentors || [], role: 'admin' })
        }

        // 크리에이터 프로필 확인
        const { data: creator } = await admin
            .from('creator_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!creator) {
            // 일반 회원 → 권한 없음
            return NextResponse.json({ success: true, mentors: [], role: 'member' })
        }

        // 크리에이터: 본인이 만든 멘토만 (삭제된 것 제외)
        const { data: mentors, error } = await admin
            .from('mentors')
            .select('id, name, title, mentor_type, status, is_active, created_at, creator_id')
            .eq('creator_id', creator.id)
            .neq('status', 'suspended')
            .order('created_at', { ascending: false })

        if (error) throw new Error(error.message)
        return NextResponse.json({ success: true, mentors: mentors || [], role: 'creator' })
    } catch (error: unknown) {
        console.error('[Creator List API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 목록 조회 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
