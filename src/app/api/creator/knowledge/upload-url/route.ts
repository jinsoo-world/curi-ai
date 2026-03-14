// /api/creator/knowledge/upload-url — Presigned URL 생성 API
// 파일을 Vercel 서버를 거치지 않고 Supabase Storage에 직접 업로드
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES_PER_MENTOR = 10
const MAX_TOTAL_SIZE = 50 * 1024 * 1024 // 합산 50MB

/**
 * POST — Signed Upload URL 생성
 * Body: { mentorId, fileName, fileSize, fileType }
 * 
 * 클라이언트가 이 URL로 직접 PUT 요청하여 Supabase Storage에 업로드
 * → Vercel 4.5MB body limit 우회
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { mentorId, fileName, fileSize, fileType } = await req.json()

        if (!mentorId || !fileName || !fileSize) {
            return NextResponse.json(
                { error: '멘토 ID, 파일명, 파일 크기는 필수입니다.' },
                { status: 400 },
            )
        }

        // 확장자 검증
        const ext = fileName.split('.').pop()?.toLowerCase() || ''
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return NextResponse.json(
                { error: '지원하지 않는 파일 형식입니다. PDF, TXT, MD, DOC, DOCX, HWP, HWPX, PPT, PPTX만 가능합니다.' },
                { status: 400 },
            )
        }

        // 파일 크기 검증
        if (fileSize > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: '파일 크기는 10MB 이하만 가능합니다.' },
                { status: 400 },
            )
        }

        // 서비스 롤 클라이언트
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 최대 파일 수 + 합산 용량 검증
        const { data: existingFiles, count } = await admin
            .from('knowledge_sources')
            .select('file_size', { count: 'exact' })
            .eq('mentor_id', mentorId)
        if ((count ?? 0) >= MAX_FILES_PER_MENTOR) {
            return NextResponse.json(
                { error: `파일은 최대 ${MAX_FILES_PER_MENTOR}개까지 등록할 수 있습니다.` },
                { status: 400 },
            )
        }
        const totalSize = (existingFiles || []).reduce((s: number, f: { file_size: number | null }) => s + (f.file_size || 0), 0)
        if (totalSize + fileSize > MAX_TOTAL_SIZE) {
            return NextResponse.json(
                { error: '파일 합산 용량이 50MB를 초과합니다.' },
                { status: 400 },
            )
        }

        // 파일 경로 생성
        const timestamp = Date.now()
        const safeName = fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
        const filePath = `${mentorId}/${timestamp}-${safeName}`

        // Signed Upload URL 생성 (60초 유효)
        const { data: signedData, error: signError } = await admin.storage
            .from('knowledge-files')
            .createSignedUploadUrl(filePath)

        if (signError || !signedData) {
            console.error('[Upload URL] Sign error:', signError?.message)
            return NextResponse.json(
                { error: '업로드 URL 생성에 실패했습니다.' },
                { status: 500 },
            )
        }

        // knowledge_sources에 레코드 미리 삽입 (processing_status: 'uploading')
        const sourceType = ext === 'pdf' ? 'pdf' : 'text'
        const { data: source, error: dbError } = await admin
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                source_type: sourceType,
                title: fileName,
                file_size: fileSize,
                original_url: filePath,
                processing_status: 'uploading',
            })
            .select()
            .single()

        if (dbError) {
            console.error('[Upload URL] DB error:', dbError.message)
            return NextResponse.json(
                { error: `파일 정보 저장에 실패했습니다: ${dbError.message}` },
                { status: 500 },
            )
        }

        return NextResponse.json({
            success: true,
            signedUrl: signedData.signedUrl,
            token: signedData.token,
            path: signedData.path,
            filePath,
            source: {
                id: source.id,
                fileName,
                fileSize,
                sourceType,
            },
        })
    } catch (error: unknown) {
        console.error('[Upload URL API] Error:', error)
        const message = error instanceof Error ? error.message : '업로드 URL 생성 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
