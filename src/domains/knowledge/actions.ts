// domains/knowledge — 지식 데이터 변경 액션

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from './embedding'

/** 표에 아직 없는 칸을 적어 넣었을 때 나는 Postgres 오류 번호 (컬럼 없음) */
const COLUMN_MISSING = '42703'

/**
 * 자료 원장(knowledge_sources)의 메타 칸 — 델파이급 Knowledge 보강 갈래B(supabase/migrations/20261001_knowledge_meta.sql).
 * 마이그레이션 전이면 표에 이 칸들이 없을 수 있다 — addKnowledgeSource 가 42703(칸 없음)을 잡아 메타 없이 한 번 더 저장하니
 * 마이그레이션이 늦게 적용돼도 앱은 안 깨진다.
 */
export interface KnowledgeSourceMeta {
    /** 자료 이름 (없으면 title 을 그대로 쓴다) */
    name?: string
    /** 이 자료가 무엇인지 한 줄 설명 */
    context?: string
    /** 내(봇 주인)가 직접 쓴 글인가 */
    authorIsMe?: boolean
    /** 인용·출처 주소 (원문 주소와 다를 수 있다) */
    citationUrl?: string
    /** 넣은 방식 세부: file/url/youtube/text/qa/note/csv/fix — source_type(4종)보다 잘게 가른다 */
    sourceKind?: string
    /** 이 자료를 가져온 시각 */
    fetchedAt?: string
}

function metaRow(meta?: KnowledgeSourceMeta): Record<string, unknown> {
    if (!meta) return {}
    const row: Record<string, unknown> = {}
    if (meta.name !== undefined) row.name = meta.name
    if (meta.context !== undefined) row.context = meta.context
    if (meta.authorIsMe !== undefined) row.author_is_me = meta.authorIsMe
    if (meta.citationUrl !== undefined) row.citation_url = meta.citationUrl
    if (meta.sourceKind !== undefined) row.source_kind = meta.sourceKind
    if (meta.fetchedAt !== undefined) row.fetched_at = meta.fetchedAt
    return row
}

/**
 * 지식 소스 등록 + 청크 분할 + 임베딩 생성
 *
 * opts.singleChunk = true 면 문단이 여러 개라도 조각을 쪼개지 않고 통째로 하나만 저장한다.
 *   Q&A(질문+답)는 질문과 답이 한 조각에 같이 있어야 「질문 그대로 검색」이 되기 때문(domains/os/knowledge addQaSource).
 * opts.meta 는 자료 목록에 보일 메타(누가·무엇을·왜). 표에 칸이 없으면(마이그레이션 전) 메타 없이 한 번 더 저장한다.
 */
export async function addKnowledgeSource(
    db: SupabaseClient,
    mentorId: string,
    title: string,
    content: string,
    sourceType: 'pdf' | 'url' | 'youtube' | 'text' = 'text',
    originalUrl?: string,
    opts?: { singleChunk?: boolean; meta?: KnowledgeSourceMeta },
) {
    const baseRow = {
        mentor_id: mentorId,
        title,
        content,
        source_type: sourceType,
        original_url: originalUrl,
        processing_status: 'processing',
    }
    const extra = metaRow(opts?.meta)

    // 1. 소스 등록 — 메타까지 같이 넣어 보고, 「그런 칸 없다」(42703)면 메타 없이 한 번 더(마이그레이션 전 하위호환)
    let { data: source, error: sourceError } = await db
        .from('knowledge_sources')
        .insert({ ...baseRow, ...extra })
        .select()
        .single()

    if (sourceError?.code === COLUMN_MISSING && Object.keys(extra).length > 0) {
        console.warn('[Knowledge] 메타 칸이 아직 없어요(마이그레이션 필요) — 메타 없이 저장합니다')
        ;({ data: source, error: sourceError } = await db.from('knowledge_sources').insert(baseRow).select().single())
    }

    if (sourceError || !source) {
        console.error('[Knowledge] addKnowledgeSource error:', sourceError)
        throw new Error('Failed to create knowledge source')
    }

    try {
        // 2. 텍스트 → 청크 분할 (singleChunk 면 쪼개지 않는다)
        const chunks = opts?.singleChunk ? [content.trim()].filter(Boolean) : splitIntoChunks(content)

        // 3. 각 청크에 임베딩 생성 + 저장
        for (let i = 0; i < chunks.length; i++) {
            const embedding = await generateEmbedding(chunks[i])

            const { error: insertError } = await db.from('knowledge_chunks').insert({
                source_id: source.id,
                mentor_id: mentorId,
                content: chunks[i],
                embedding: embedding,
                chunk_index: i,
            })
            if (insertError) {
                console.error(`[Knowledge] 조각 ${i} 저장 실패:`, JSON.stringify(insertError))
                throw new Error(`조각 저장 실패: ${insertError.message}`)
            }
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
