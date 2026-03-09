// /api/creator/knowledge/upload — 파일 업로드 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = [
    'application/pdf',
    'text/plain',
    'text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * POST — 파일 업로드
 * FormData: file, mentorId
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const formData = await req.formData()
        const file = formData.get('file') as File | null
        const mentorId = formData.get('mentorId') as string | null

        if (!file || !mentorId) {
            return NextResponse.json(
                { error: '파일과 멘토 ID는 필수입니다.' },
                { status: 400 },
            )
        }

        // 파일 타입 검증
        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: '지원하지 않는 파일 형식입니다. PDF, TXT, MD, DOC, DOCX만 가능합니다.' },
                { status: 400 },
            )
        }

        // 파일 크기 검증
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: '파일 크기는 10MB 이하만 가능합니다.' },
                { status: 400 },
            )
        }

        // 서비스 롤 클라이언트 (RLS 우회)
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 파일명 생성
        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
        const filePath = `${mentorId}/${timestamp}-${safeName}`

        // Supabase Storage에 업로드
        const fileBuffer = Buffer.from(await file.arrayBuffer())
        const { error: uploadError } = await admin.storage
            .from('knowledge-files')
            .upload(filePath, fileBuffer, {
                contentType: file.type,
                upsert: false,
            })

        if (uploadError) {
            console.error('[Upload] Storage error:', uploadError.message)
            return NextResponse.json(
                { error: '파일 업로드에 실패했습니다.' },
                { status: 500 },
            )
        }

        // knowledge_sources에 레코드 삽입
        const sourceType = file.type === 'application/pdf' ? 'pdf' : 'text'
        const { data: source, error: dbError } = await admin
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                source_type: sourceType,
                title: file.name,
                original_url: filePath,
                processing_status: 'pending',
            })
            .select()
            .single()

        if (dbError) {
            console.error('[Upload] DB error:', dbError.message)
            // 실패 시 업로드된 파일 삭제
            await admin.storage.from('knowledge-files').remove([filePath])
            return NextResponse.json(
                { error: '파일 정보 저장에 실패했습니다.' },
                { status: 500 },
            )
        }

        return NextResponse.json({
            success: true,
            source: {
                id: source.id,
                fileName: file.name,
                fileSize: file.size,
                sourceType,
                filePath,
            },
        })
    } catch (error: unknown) {
        console.error('[Upload API] Error:', error)
        const message = error instanceof Error ? error.message : '파일 업로드 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
