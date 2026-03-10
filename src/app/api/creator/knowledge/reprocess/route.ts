// /api/creator/knowledge/reprocess — pending 상태 소스 재처리
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // pending 상태인 소스 전부 조회
        const { data: sources } = await admin
            .from('knowledge_sources')
            .select('*')
            .eq('processing_status', 'pending')

        if (!sources || sources.length === 0) {
            return NextResponse.json({ message: 'pending 소스 없음' })
        }

        const results = []
        for (const source of sources) {
            try {
                await admin.from('knowledge_sources')
                    .update({ processing_status: 'processing' })
                    .eq('id', source.id)

                // Storage에서 다운로드
                const { data: fileData, error: dlErr } = await admin.storage
                    .from('knowledge-files')
                    .download(source.original_url)

                if (dlErr || !fileData) {
                    await admin.from('knowledge_sources')
                        .update({ processing_status: 'failed' })
                        .eq('id', source.id)
                    results.push({ id: source.id, title: source.title, status: 'download_failed' })
                    continue
                }

                const ext = source.title?.split('.').pop()?.toLowerCase() || ''
                let textContent = ''

                if (['txt', 'md'].includes(ext)) {
                    textContent = await fileData.text()
                } else {
                    // PDF/HWP/DOCX → Upstage
                    const formData = new FormData()
                    formData.append('document', fileData, source.title)
                    const parseRes = await fetch('https://api.upstage.ai/v1/document-digitization', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}` },
                        body: formData,
                    })
                    if (parseRes.ok) {
                        const pd = await parseRes.json()
                        textContent = pd.content?.text || pd.text || ''
                        if (!textContent && pd.elements) {
                            textContent = pd.elements.map((e: { text?: string }) => e.text || '').join('\n\n')
                        }
                    }
                }

                if (!textContent.trim()) {
                    await admin.from('knowledge_sources')
                        .update({ processing_status: 'failed' })
                        .eq('id', source.id)
                    results.push({ id: source.id, title: source.title, status: 'no_text' })
                    continue
                }

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

                results.push({ id: source.id, title: source.title, status: 'completed', chunks: ok })
            } catch (err) {
                await admin.from('knowledge_sources')
                    .update({ processing_status: 'failed' })
                    .eq('id', source.id)
                results.push({ id: source.id, title: source.title, status: 'error' })
            }
        }

        return NextResponse.json({ processed: results })
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : '처리 실패'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
