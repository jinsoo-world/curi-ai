// /api/creator/knowledge/process — 업로드된 파일 텍스트 추출 + 임베딩
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Upstage Document Parse 결과에서 텍스트 추출
 * 응답 형식: content.html에 실제 컨텐츠, text/markdown은 빈 문자열
 */
function extractTextFromUpstage(pd: Record<string, unknown>): string {
    const content = pd.content as Record<string, string> | undefined

    // 1. output_formats에 text를 포함했으면 content.text에 값이 있음
    if (content?.text) return content.text

    // 2. HTML에서 태그 제거하여 텍스트 추출 (기본 응답 형식)
    if (content?.html) {
        return content.html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?(p|div|h[1-6]|li|tr|td|th)[^>]*>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n{3,}/g, '\n\n')
            .trim()
    }

    // 3. markdown
    if (content?.markdown) return content.markdown

    // 4. elements 배열 fallback
    if (Array.isArray(pd.elements)) {
        const texts = pd.elements.map((el: Record<string, unknown>) => {
            const elContent = el.content as Record<string, string> | undefined
            if (elContent?.text) return elContent.text
            if (elContent?.html) {
                return (elContent.html)
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<[^>]*>/g, '')
                    .trim()
            }
            return ''
        }).filter(Boolean)
        if (texts.length > 0) return texts.join('\n\n')
    }

    return ''
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

        const { sourceId, mentorId } = await req.json()
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const { data: source, error: srcErr } = await admin
            .from('knowledge_sources')
            .select('*')
            .eq('id', sourceId)
            .single()

        if (srcErr || !source) {
            return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 })
        }

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

        const ext = source.title?.split('.').pop()?.toLowerCase() || ''
        let textContent = ''

        if (['txt', 'md'].includes(ext)) {
            textContent = await fileData.text()
        } else {
            // PDF/HWP/DOCX/PPT → Upstage Document OCR (비용 효율: $0.0015/page)
            try {
                console.log('[Process] Sending to Upstage OCR:', source.title, 'size:', fileData.size, 'ext:', ext)
                const formData = new FormData()
                formData.append('document', fileData, source.title)
                formData.append('model', 'ocr')
                formData.append('ocr', 'force')

                const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                    body: formData,
                })

                if (parseRes.ok) {
                    const pd = await parseRes.json()
                    console.log('[Process] Upstage keys:', Object.keys(pd))
                    textContent = extractTextFromUpstage(pd)
                    if (!textContent) {
                        console.log('[Process] No text extracted. Raw response:', JSON.stringify(pd).slice(0, 1000))
                    } else {
                        console.log('[Process] Extracted text length:', textContent.length)
                    }
                } else {
                    const errText = await parseRes.text()
                    console.error('[Process] Upstage error:', parseRes.status, parseRes.statusText, errText.slice(0, 500))
                }
            } catch (parseErr) {
                console.error('[Process] Parse error:', parseErr)
            }
        }

        if (!textContent.trim()) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', sourceId)
            return NextResponse.json({ error: '텍스트를 추출할 수 없습니다.' }, { status: 400 })
        }

        // 텍스트 → 청크 → 임베딩
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

        await admin.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: successCount,
                content: textContent,
            })
            .eq('id', sourceId)

        return NextResponse.json({
            success: true,
            chunksProcessed: successCount,
            totalChunks: chunks.length,
            totalCharacters: textContent.length,
        })
    } catch (error: unknown) {
        console.error('[Process API] Error:', error)
        const message = error instanceof Error ? error.message : '처리 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
