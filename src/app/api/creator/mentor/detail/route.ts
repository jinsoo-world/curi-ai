// /api/creator/mentor/detail — 멘토 상세 조회
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const mentorId = req.nextUrl.searchParams.get('id')
        if (!mentorId) {
            return NextResponse.json({ error: '멘토 ID는 필수입니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const { data: mentor, error } = await admin
            .from('mentors')
            .select('id, name, title, description, expertise, system_prompt, greeting_message, sample_questions, is_active, status, mentor_type, creator_id, avatar_url, created_at, category, organization, persona_template, voice_sample_url, voice_id')
            .eq('id', mentorId)
            .single()

        if (error || !mentor) {
            return NextResponse.json({ error: '멘토를 찾을 수 없습니다.' }, { status: 404 })
        }

        return NextResponse.json({ success: true, mentor })
    } catch (error: unknown) {
        console.error('[Creator Detail API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 조회 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
