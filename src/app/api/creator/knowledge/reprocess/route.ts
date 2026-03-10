// /api/creator/knowledge/reprocess — pending/failed 상태 소스 재처리
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Upstage Document Parse 결과에서 텍스트 추출
 * 응답: content.html에 실제 컨텐츠, text/markdown은 빈 문자열
 */
function extractTextFromUpstage(pd: Record<string, unknown>): string {
    const content = pd.content as Record<string, string> | undefined

    if (content?.text) return content.text

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

    if (content?.markdown) return content.markdown

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

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // pending 또는 failed 상태인 소스 전부 조회
        const { data: sources } = await admin
            .from('knowledge_sources')
            .select('*')
            .in('processing_status', ['pending', 'failed'])

        if (!sources || sources.length === 0) {
            return NextResponse.json({ message: 'pending/failed 소스 없음' })
        }

        const results = []
        for (const source of sources) {
            try {
                await admin.from('knowledge_sources')
                    .update({ processing_status: 'processing' })
                    .eq('id', source.id)

                const { data: fileData, error: dlErr } = await admin.storage
                    .from('knowledge-files')
                    .download(source.original_url)

                if (dlErr || !fileData) {
                    await admin.from('knowledge_sources')
                        .update({ processing_status: 'failed' })
                        .eq('id', source.id)
                    results.push({ id: source.id, title: source.title, status: 'download_failed', error: dlErr?.message })
                    continue
                }

                const ext = source.title?.split('.').pop()?.toLowerCase() || ''
                let textContent = ''

                if (['txt', 'md'].includes(ext)) {
                    textContent = await fileData.text()
                } else {
                    // PDF/HWP/DOCX → Upstage Document Parse
                    const formData = new FormData()
                    formData.append('document', fileData, source.title)
                    formData.append('model', 'document-parse')
                    formData.append('ocr', 'force')
                    formData.append('output_formats', "['html', 'text']")

                    const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                        body: formData,
                    })

                    if (parseRes.ok) {
                        const pd = await parseRes.json()
                        console.log('[Reprocess] Upstage keys:', Object.keys(pd))
                        textContent = extractTextFromUpstage(pd)
                        console.log('[Reprocess] Extracted text length:', textContent.length)
                    } else {
                        const errText = await parseRes.text()
                        console.error('[Reprocess] Upstage error:', parseRes.status, errText.slice(0, 300))
                        results.push({ id: source.id, title: source.title, status: 'upstage_error', error: errText.slice(0, 100) })
                        await admin.from('knowledge_sources')
                            .update({ processing_status: 'failed' })
                            .eq('id', source.id)
                        continue
                    }
                }

                if (!textContent.trim()) {
                    await admin.from('knowledge_sources')
                        .update({ processing_status: 'failed' })
                        .eq('id', source.id)
                    results.push({ id: source.id, title: source.title, status: 'no_text' })
                    continue
                }

                // 기존 청크 삭제 (재처리 시 중복 방지)
                await admin.from('knowledge_chunks')
                    .delete()
                    .eq('source_id', source.id)

                const chunks = splitIntoChunks(textContent)
                let ok = 0
                for (let i = 0; i < chunks.length; i++) {
                    try {
                        const emb = await generateEmbedding(chunks[i])
                        await admin.from('knowledge_chunks').insert({
                            source_id: source.id,
                            mentor_id: source.mentor_id,
                            content: chunks[i],
                            embedding: emb,
                            chunk_index: i,
                        })
                        ok++
                    } catch { /* skip */ }
                }

                await admin.from('knowledge_sources')
                    .update({
                        processing_status: 'completed',
                        chunk_count: ok,
                        content: textContent.slice(0, 5000),
                    })
                    .eq('id', source.id)

                results.push({ id: source.id, title: source.title, status: 'completed', chunks: ok, textLength: textContent.length })
            } catch (err) {
                await admin.from('knowledge_sources')
                    .update({ processing_status: 'failed' })
                    .eq('id', source.id)
                results.push({ id: source.id, title: source.title, status: 'error', error: String(err) })
            }
        }

        return NextResponse.json({ processed: results })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '처리 실패'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
