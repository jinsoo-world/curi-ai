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

// HWP/HWPX는 MIME 타입이 없으므로 확장자로 체크
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES_PER_MENTOR = 3

// 확장자 → fallback MIME 매핑 (HWP 등 MIME이 빈 파일용)
// Supabase Storage는 비표준 MIME을 거부할 수 있어 octet-stream 사용
const EXT_MIME_MAP: Record<string, string> = {
    hwp: 'application/octet-stream',
    hwpx: 'application/octet-stream',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
}

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

        // 파일 타입 검증 (MIME 또는 확장자)
        const ext = file.name.split('.').pop()?.toLowerCase() || ''
        if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
            return NextResponse.json(
                { error: '지원하지 않는 파일 형식입니다. HWP, PDF, TXT, MD, DOC, DOCX만 가능합니다.' },
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

        // 최대 파일 수 검증 (멘토당 3개)
        const { count } = await admin
            .from('knowledge_sources')
            .select('*', { count: 'exact', head: true })
            .eq('mentor_id', mentorId)
        if ((count ?? 0) >= MAX_FILES_PER_MENTOR) {
            return NextResponse.json(
                { error: `파일은 최대 ${MAX_FILES_PER_MENTOR}개까지 등록할 수 있습니다.` },
                { status: 400 },
            )
        }

        // 파일명 생성
        const timestamp = Date.now()
        const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
        const filePath = `${mentorId}/${timestamp}-${safeName}`

        // contentType: MIME이 비어있으면 확장자 기반 fallback
        const uploadContentType = file.type || EXT_MIME_MAP[ext] || 'application/octet-stream'

        // Supabase Storage에 업로드
        const fileBuffer = Buffer.from(await file.arrayBuffer())
        const { error: uploadError } = await admin.storage
            .from('knowledge-files')
            .upload(filePath, fileBuffer, {
                contentType: uploadContentType,
                upsert: false,
            })

        if (uploadError) {
            console.error('[Upload] Storage error:', uploadError.message, 'contentType:', uploadContentType, 'path:', filePath)
            return NextResponse.json(
                { error: `파일 업로드에 실패했습니다: ${uploadError.message}` },
                { status: 500 },
            )
        }

        // knowledge_sources에 레코드 삽입
        // source_type: DB에 허용된 값으로 매핑 (pdf, text가 안전한 값)
        const sourceType = ext === 'pdf' ? 'pdf' : 'text'
        const fileUrl = admin.storage.from('knowledge-files').getPublicUrl(filePath).data.publicUrl
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
            console.error('[Upload] DB error:', dbError.message, 'code:', dbError.code, 'details:', dbError.details)
            // 실패 시 업로드된 파일 삭제
            await admin.storage.from('knowledge-files').remove([filePath])
            return NextResponse.json(
                { error: `파일 정보 저장에 실패했습니다: ${dbError.message}` },
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
                fileUrl,
            },
        })
    } catch (error: unknown) {
        console.error('[Upload API] Error:', error)
        const message = error instanceof Error ? error.message : '파일 업로드 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
