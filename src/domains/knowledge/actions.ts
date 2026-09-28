// domains/knowledge — 지식 데이터 변경 액션

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunksWithHeadings, contextualEmbeddingText } from './embedding'
import { FAILURE_REASONS, type FailureReason } from './failure-reasons'

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
 * 못 읽은 이유 코드를 적는 칸 (20261008f_ontology_phase1 의 failure_reason, 코드는 failure-reasons.ts).
 * 그 전(0929 01시 무렵) 잠깐 summary 칸에 적은 이유 글은 LEGACY_FAIL_REASON_COL 로 읽기만 한다.
 */
export const FAIL_REASON_COL = 'failure_reason'
export const LEGACY_FAIL_REASON_COL = 'summary'

/** 오류 → 실패 이유 코드 */
export function failReasonCode(e: unknown): FailureReason {
    const raw = (e instanceof Error ? e.message : String(e ?? '')).trim()
    if (/fetch failed|ECONN|ETIMEDOUT|timeout|timed out|aborted/i.test(raw)) return 'timeout'
    if (/조각 저장 실패|embedding|임베딩/i.test(raw)) return 'chunk_save_failed'
    if (/읽을 글을 못 찾|너무 짧/i.test(raw)) return 'empty_content'
    return 'unknown'
}

/** 오류 → 화면에 보일 한 줄 (코드의 문구) */
export function failReasonLine(e: unknown): string {
    return FAILURE_REASONS[failReasonCode(e)]
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
        // Q&A(singleChunk)는 질문 그대로 검색이 되도록 머리말 없이 원문만 임베딩한다
        const pieces = opts?.singleChunk
            ? [content.trim()].filter(Boolean).map(text => ({ text, heading: null as string | null }))
            : splitIntoChunksWithHeadings(content)
        const chunks = pieces.map(p => p.text)

        // 3. 각 청크에 임베딩 생성 + 저장 (임베딩 글에만 자료 제목, 종류, 소제목을 붙인다. 저장 글은 원문)
        for (let i = 0; i < chunks.length; i++) {
            const 임베딩글 = opts?.singleChunk ? chunks[i] : contextualEmbeddingText({ title, sourceType, heading: pieces[i].heading }, chunks[i])
            const embedding = await generateEmbedding(임베딩글, { route: 'knowledge/actions', mentorId })

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
        // 못 읽은 이유 코드를 남긴다. 화면이 문구로 바꿔 「다시 시도」와 함께 보여 준다
        await db.from('knowledge_sources')
            .update({ processing_status: 'failed', [FAIL_REASON_COL]: failReasonCode(error) })
            .eq('id', source.id)

        console.error('[Knowledge] Processing failed:', error)
        throw error
    }
}
