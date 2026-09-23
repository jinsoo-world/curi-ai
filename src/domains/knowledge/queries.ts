// domains/knowledge — 지식 검색 쿼리

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MatchedKnowledge } from './types'

// Q&A 조각은 언제나 「질문: …\n답: …」 모양으로 저장된다(domains/os/knowledge addQaSource, 청크 하나 그대로).
// match_knowledge RPC 는 벡터로만 후보를 고르고 Q&A 인지, 질문이 겹치는지는 모른다. 그래서 후보를 조금 더
// 받아 여기서(앱 단) 다시 줄을 세운다 — RPC 가 이미 mentor_id 로 건 자료만 받으므로 순서만 바뀔 뿐 다른
// 봇 자료가 섞여 들어오는 일은 없다(교차 계정 위험 없음).
const QA_PREFIX = /^질문:\s*/
const QA_SPLIT = /\n답:\s*/

/** 조각 글에서 「질문」 부분만 뽑는다. Q&A 조각이 아니면 null */
function qaQuestionOf(content: string): string | null {
    if (!QA_PREFIX.test(content)) return null
    const rest = content.replace(QA_PREFIX, '')
    const i = rest.search(QA_SPLIT)
    return (i === -1 ? rest : rest.slice(0, i)).trim()
}

/** 대충 낱말 집합으로 쪼갠다 — 정확한 형태소 분석이 아니라 「겹치는 낱말이 있나」만 본다 */
function tokens(s: string): Set<string> {
    return new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2))
}

/** 두 낱말 집합이 얼마나 겹치나(0~1). 짧은 쪽 기준 — 저장된 질문이 실제 사용자 말보다 짧을 때가 많다 */
function overlapRatio(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0
    let hit = 0
    for (const t of a) if (b.has(t)) hit++
    return hit / Math.min(a.size, b.size)
}

/** Q&A 조각 기본 가산점(직접 가르친 정답이라 살짝 앞세운다) */
const QA_BASE_BOOST = 0.03
/** 저장된 질문이 실제 사용자 말과 겹칠 때 더하는 최대 가산점 */
const QA_MATCH_BOOST = 0.15

/**
 * 벡터 유사도 기반 지식 검색
 * match_knowledge RPC 함수 호출
 *
 * queryText 를 같이 주면(대화 중 실제 사용자 말) Q&A 로 넣은 조각 중 질문이 겹치는 것을 더 앞세운다.
 */
export async function matchKnowledge(
    db: SupabaseClient,
    queryEmbedding: number[],
    mentorId: string,
    threshold = 0.7,
    count = 5,
    queryText?: string,
): Promise<MatchedKnowledge[]> {
    // 🛡 봇(mentor) 지정 없이 검색하면 다른 사람 자료가 섞인다. 빠지면 조용히 빈 배열이 아니라 예외.
    if (!mentorId || typeof mentorId !== 'string') {
        throw new Error('matchKnowledge: mentorId 는 필수다 (자료 격리)')
    }
    // Q&A 재순위를 매기려면 후보가 조금 더 있어야 한다(요청한 수만 받으면 다시 줄 세울 게 없다)
    const fetchCount = Math.min(Math.max(count * 3, count), 20)
    try {
        const { data, error } = await db.rpc('match_knowledge', {
            query_embedding: queryEmbedding,
            match_mentor_id: mentorId,
            match_threshold: threshold,
            match_count: fetchCount,
        })

        if (error) {
            console.error('[Knowledge] matchKnowledge RPC error:', error)
            return []
        }

        const rows = (data || []) as MatchedKnowledge[]
        const qTokens = queryText ? tokens(queryText) : null
        return rows
            .map(row => {
                const question = qaQuestionOf(row.content)
                let boost = 0
                if (question !== null) {
                    boost += QA_BASE_BOOST
                    if (qTokens) boost += QA_MATCH_BOOST * overlapRatio(tokens(question), qTokens)
                }
                return { row, score: (row.similarity ?? 0) + boost }
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(x => x.row)
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
