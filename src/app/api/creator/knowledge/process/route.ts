// /api/creator/knowledge/process — 업로드된 파일 텍스트 추출 + 임베딩
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60초 타임아웃

/**
 * POST — 파일 파싱 + 임베딩
 * Body: { sourceId, mentorId }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { sourceId, mentorId } = await req.json()

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // knowledge_sources에서 파일 경로 조회
        const { data: source, error: srcErr } = await admin
            .from('knowledge_sources')
            .select('*')
            .eq('id', sourceId)
            .single()

        if (srcErr || !source) {
            return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 })
        }

        // 상태를 processing으로
        await admin.from('knowledge_sources')
            .update({ processing_status: 'processing' })
            .eq('id', sourceId)

        // Storage에서 파일 다운로드
        const { data: fileData, error: dlError } = await admin.storage
            .from('knowledge-files')
            .download(source.original_url)

        if (dlError || !fileData) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', sourceId)
            return NextResponse.json({ error: '파일 다운로드 실패' }, { status: 500 })
        }

        // 텍스트 추출
        let textContent = ''
        const ext = source.title?.split('.').pop()?.toLowerCase() || ''

        if (['txt', 'md'].includes(ext)) {
            textContent = await fileData.text()
        } else if (ext === 'pdf') {
            // PDF → Upstage Document Parse API
            try {
                const formData = new FormData()
                formData.append('document', fileData, source.title)

                const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`,
                    },
                    body: formData,
                })

                if (parseRes.ok) {
                    const parseData = await parseRes.json()
                    textContent = parseData.content?.text || parseData.text || ''
                    // elements fallback
                    if (!textContent && parseData.elements) {
                        textContent = parseData.elements
                            .map((el: { text?: string }) => el.text || '')
                            .join('\n\n')
                    }
                } else {
                    console.error('[Process] Upstage parse failed:', parseRes.status, await parseRes.text())
                    // Fallback: 파일 내용 그대로 (바이너리라 제한적)
                    textContent = `[PDF 파일: ${source.title}] 파싱 실패 — 수동 텍스트 입력이 필요합니다.`
                }
            } catch (parseErr) {
                console.error('[Process] Parse error:', parseErr)
                textContent = `[PDF 파일: ${source.title}] 파싱 중 에러 발생`
            }
        } else if (['hwp', 'hwpx'].includes(ext)) {
            // HWP → Upstage
            try {
                const formData = new FormData()
                formData.append('document', fileData, source.title)

                const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`,
                    },
                    body: formData,
                })

                if (parseRes.ok) {
                    const parseData = await parseRes.json()
                    textContent = parseData.content?.text || parseData.text || ''
                    if (!textContent && parseData.elements) {
                        textContent = parseData.elements
                            .map((el: { text?: string }) => el.text || '')
                            .join('\n\n')
                    }
                } else {
                    textContent = `[HWP 파일: ${source.title}] 파싱 실패`
                }
            } catch {
                textContent = `[HWP 파일: ${source.title}] 파싱 중 에러 발생`
            }
        } else if (['doc', 'docx', 'ppt', 'pptx'].includes(ext)) {
            // DOCX/PPTX → Upstage
            try {
                const formData = new FormData()
                formData.append('document', fileData, source.title)

                const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`,
                    },
                    body: formData,
                })

                if (parseRes.ok) {
                    const parseData = await parseRes.json()
                    textContent = parseData.content?.text || parseData.text || ''
                    if (!textContent && parseData.elements) {
                        textContent = parseData.elements
                            .map((el: { text?: string }) => el.text || '')
                            .join('\n\n')
                    }
                } else {
                    textContent = `[파일: ${source.title}] 파싱 실패`
                }
            } catch {
                textContent = `[파일: ${source.title}] 파싱 중 에러 발생`
            }
        }

        if (!textContent.trim()) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', sourceId)
            return NextResponse.json({ error: '텍스트를 추출할 수 없습니다.' }, { status: 400 })
        }

        // 텍스트 → 청크 분할 → 임베딩
        const chunks = splitIntoChunks(textContent)
        let successCount = 0

        for (let i = 0; i < chunks.length; i++) {
            try {
                const embedding = await generateEmbedding(chunks[i])
                await admin.from('knowledge_chunks').insert({
                    source_id: sourceId,
                    mentor_id: mentorId,
                    content: chunks[i],
                    embedding,
                    chunk_index: i,
                })
                successCount++
            } catch (embErr) {
                console.error(`[Process] Chunk ${i} embedding failed:`, embErr)
            }
        }

        // 완료 업데이트
        await admin.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: successCount,
                content: textContent.slice(0, 5000), // 원본 텍스트 앞부분 저장
            })
            .eq('id', sourceId)

        return NextResponse.json({
            success: true,
            chunksProcessed: successCount,
            totalChunks: chunks.length,
        })
    } catch (error: unknown) {
        console.error('[Process API] Error:', error)
        const message = error instanceof Error ? error.message : '처리 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
