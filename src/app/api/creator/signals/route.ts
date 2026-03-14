import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { getSignalStats } from '@/domains/chat/signals'

export const dynamic = 'force-dynamic'

/**
 * GET /api/creator/signals?mentorId=xxx&days=30
 * 크리에이터용 — 자기 멘토의 외부 신호 통계 조회
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const mentorId = searchParams.get('mentorId')
        const days = parseInt(searchParams.get('days') || '30', 10)

        if (!mentorId) {
            return NextResponse.json({ error: 'mentorId가 필요합니다.' }, { status: 400 })
        }

        // 서비스 롤 클라이언트
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 이 멘토가 현재 유저의 것인지 확인
        const { data: mentor } = await admin
            .from('mentors')
            .select('id, creator_id, name')
            .eq('id', mentorId)
            .single()

        if (!mentor) {
            return NextResponse.json({ error: '멘토를 찾을 수 없습니다.' }, { status: 404 })
        }

        // creator_id 확인 (없으면 관리자만 접근 가능)
        if (mentor.creator_id && mentor.creator_id !== user.id) {
            return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 })
        }

        const stats = await getSignalStats(admin, mentorId, days)

        return NextResponse.json({
            mentorId,
            mentorName: mentor.name,
            period: `${days}일`,
            stats,
        })
    } catch (error: any) {
        console.error('[Creator Signals API] GET error:', error)
        return NextResponse.json(
            { error: error?.message || '조회 중 오류' },
            { status: 500 }
        )
    }
}
