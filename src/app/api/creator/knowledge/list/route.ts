// /api/creator/knowledge/list — 멘토별 지식 파일 목록 조회
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const mentorId = req.nextUrl.searchParams.get('mentorId')
        if (!mentorId) {
            return NextResponse.json({ error: 'mentorId 필수' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('knowledge_sources')
            .select('id, title, source_type, processing_status, chunk_count, content, file_size, created_at')
            .eq('mentor_id', mentorId)
            .order('created_at', { ascending: false })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ sources: data || [] })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : '조회 실패'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
