// domains/knowledge — 지식 데이터 변경 액션

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from './embedding'

/**
 * 지식 소스 등록 + 청크 분할 + 임베딩 생성
 */
export async function addKnowledgeSource(
    db: SupabaseClient,
    mentorId: string,
    title: string,
    content: string,
    sourceType: 'pdf' | 'url' | 'youtube' | 'text' = 'text',
    originalUrl?: string,
) {
    // 1. 소스 등록
    const { data: source, error: sourceError } = await db
        .from('knowledge_sources')
        .insert({
            mentor_id: mentorId,
            title,
            content,
            source_type: sourceType,
            original_url: originalUrl,
            processing_status: 'processing',
        })
        .select()
        .single()

    if (sourceError || !source) {
        console.error('[Knowledge] addKnowledgeSource error:', sourceError)
        throw new Error('Failed to create knowledge source')
    }

    try {
        // 2. 텍스트 → 청크 분할
        const chunks = splitIntoChunks(content)

        // 3. 각 청크에 임베딩 생성 + 저장
        for (let i = 0; i < chunks.length; i++) {
            const embedding = await generateEmbedding(chunks[i])

            await db.from('knowledge_chunks').insert({
                source_id: source.id,
                mentor_id: mentorId,
                content: chunks[i],
                embedding: embedding,
                chunk_index: i,
            })
        }

        // 4. 처리 완료
        await db.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: chunks.length,
            })
            .eq('id', source.id)

        console.log(`[Knowledge] ${title}: ${chunks.length} chunks processed`)
        return source
    } catch (error) {
        // 처리 실패
        await db.from('knowledge_sources')
            .update({ processing_status: 'failed' })
            .eq('id', source.id)

        console.error('[Knowledge] Processing failed:', error)
        throw error
    }
}
