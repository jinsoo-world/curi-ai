// /api/creator/mentor/delete — 멘토 삭제 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * DELETE — AI 멘토 삭제
 * body: { mentorId }
 */
export async function DELETE(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { mentorId } = await req.json()

        if (!mentorId) {
            return NextResponse.json({ error: '멘토 ID는 필수입니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 크리에이터 프로필 확인
        const { data: creator } = await admin
            .from('creator_profiles')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle()

        // 멘토 소유권 확인 (크리에이터 본인 것만 삭제 가능)
        const { data: mentor } = await admin
            .from('mentors')
            .select('id, creator_id, mentor_type')
            .eq('id', mentorId)
            .single()

        if (!mentor) {
            return NextResponse.json({ error: '멘토를 찾을 수 없습니다.' }, { status: 404 })
        }

        // 크리에이터가 만든 멘토인 경우 본인 것만 삭제
        if (mentor.mentor_type === 'creator' && mentor.creator_id !== creator?.id) {
            return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 })
        }

        // 관련 knowledge_sources 삭제
        await admin
            .from('knowledge_sources')
            .delete()
            .eq('mentor_id', mentorId)

        // 멘토 비활성화 (soft delete)
        const { error } = await admin
            .from('mentors')
            .update({
                is_active: false,
                status: 'suspended',
                updated_at: new Date().toISOString(),
            })
            .eq('id', mentorId)

        if (error) {
            console.error('[Creator] deleteMentor error:', error.message)
            throw new Error(error.message)
        }

        return NextResponse.json({ success: true, message: '멘토가 삭제되었습니다.' })
    } catch (error: unknown) {
        console.error('[Creator Delete API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 삭제 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
