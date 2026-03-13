// 지식 파일 삭제 API
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export async function DELETE(request: Request) {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

        const { sourceId, mentorId } = await request.json()
        if (!sourceId || !mentorId) {
            return NextResponse.json({ error: 'sourceId, mentorId 필요' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 1) knowledge_sources에서 파일 정보 조회
        const { data: source, error: fetchErr } = await admin
            .from('knowledge_sources')
            .select('*')
            .eq('id', sourceId)
            .eq('mentor_id', mentorId)
            .single()

        if (fetchErr || !source) {
            return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
        }

        // 2) Storage에서 파일 삭제 (upload API가 original_url에 Storage path를 저장)
        const storagePath = source.file_path || source.original_url
        if (storagePath && !storagePath.startsWith('http')) {
            await admin.storage.from('knowledge-files').remove([storagePath])
        }

        // 3) knowledge_chunks 삭제
        await admin.from('knowledge_chunks')
            .delete()
            .eq('source_id', sourceId)

        // 4) knowledge_sources 레코드 삭제
        const { error: delErr } = await admin
            .from('knowledge_sources')
            .delete()
            .eq('id', sourceId)

        if (delErr) {
            console.error('[Delete] DB error:', delErr.message)
            return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('[Delete] Error:', err)
        return NextResponse.json({ error: '서버 오류' }, { status: 500 })
    }
}
