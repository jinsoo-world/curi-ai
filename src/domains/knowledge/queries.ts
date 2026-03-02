// domains/knowledge — 지식 검색 쿼리

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchedKnowledge } from './types'

/**
 * 벡터 유사도 기반 지식 검색
 * match_knowledge RPC 함수 호출
 */
export async function matchKnowledge(
    db: SupabaseClient,
    queryEmbedding: number[],
    mentorId: string,
    threshold = 0.7,
    count = 5,
): Promise<MatchedKnowledge[]> {
    try {
        const { data, error } = await db.rpc('match_knowledge', {
            query_embedding: queryEmbedding,
            match_mentor_id: mentorId,
            match_threshold: threshold,
            match_count: count,
        })

        if (error) {
            console.error('[Knowledge] matchKnowledge RPC error:', error)
            return []
        }

        return (data || []) as MatchedKnowledge[]
    } catch (error) {
        // RPC 미생성 시 조용히 빈 배열 반환
        console.error('[Knowledge] matchKnowledge error:', error)
        return []
    }
}

/**
 * 멘토의 지식 소스 목록 조회
 */
export async function getKnowledgeSources(
    db: SupabaseClient,
    mentorId: string,
) {
    const { data, error } = await db
        .from('knowledge_sources')
        .select('*')
        .eq('mentor_id', mentorId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[Knowledge] getKnowledgeSources error:', error)
        return []
    }

    return data || []
}
