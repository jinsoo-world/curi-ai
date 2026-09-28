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

/** Q&A 가산점을 더해 다시 줄 세운다 (base = 벡터 유사도 또는 합친 순위 점수) */
function rerankWithQa<T extends MatchedKnowledge>(items: { row: T; base: number }[], queryText: string | undefined, count: number): T[] {
    const qTokens = queryText ? tokens(queryText) : null
    return items
        .map(({ row, base }) => {
            const question = qaQuestionOf(row.content)
            let boost = 0
            if (question !== null) {
                boost += QA_BASE_BOOST
                if (qTokens) boost += QA_MATCH_BOOST * overlapRatio(tokens(question), qTokens)
            }
            return { row, score: base + boost }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(x => x.row)
}

/* ────────────── 하이브리드 검색 (벡터 + 낱말) ────────────── */

/** 켜고 끄기: HYBRID_SEARCH_ENABLED=false 면 예전 벡터 검색만 */
export function hybridSearchEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return String(env.HYBRID_SEARCH_ENABLED ?? 'true').toLowerCase() !== 'false'
}

// 낱말 끝에 붙는 조사와 어미 (긴 것부터 떼어 본다). 형태소 분석이 아니라 「줄기만 남기기」 어림셈
const KO_SUFFIXES = [
    '이라는', '에서는', '으로는', '에게서', '한테서', '이란', '에서', '에게', '한테', '으로', '까지', '부터', '보다', '처럼', '이랑', '라는',
    '하는', '했던', '하고', '해서', '하면', '인가요', '인가', '나요', '까요', '해요', '이요', '에요', '예요',
    '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '의', '도', '만', '랑', '요',
]
// 어디에나 나와서 검색에 도움이 안 되는 말
const STOPWORDS = new Set([
    '무엇', '뭐야', '뭔가', '뭐지', '뭔지', '어떻게', '어떤', '어디', '언제', '누구', '얼마', '알려줘', '알려주세요', '알려', '설명해줘', '설명해',
    '설명', '대해', '대해서', '관련', '그리고', '그런데', '정말', '혹시', '있나', '있어', '있나요', '없나', '해줘', '해주세요', '좀', '이거', '그거', '저거',
    '우리', '제가', '저는', '나는', '내가', '방법', '하나', '같은', '이런', '그런', '어떻', '궁금',
    'the', 'and', 'what', 'how', 'why', 'who', 'is', 'are', 'for', 'with', 'about', 'please', 'tell', 'me',
])

/** 검색어를 낱말로 쪼갠다: 조사를 떼고, 2글자 미만과 흔한 말을 버린다. 최대 8개 */
export function keywordTerms(query: string): string[] {
    const out: string[] = []
    for (const raw of String(query ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
        if (!raw) continue
        let w = raw
        if (/^[\uAC00-\uD7A3]+$/.test(w)) {
            for (const suf of KO_SUFFIXES) {
                if (w.length - suf.length >= 2 && w.endsWith(suf)) { w = w.slice(0, -suf.length); break }
            }
        }
        if (w.length < 2 || STOPWORDS.has(w) || STOPWORDS.has(raw)) continue
        if (!out.includes(w)) out.push(w)
        if (out.length >= 8) break
    }
    return out
}

/** RRF 상수 (보통 60). 순위 1등끼리 합치면 2/61 */
const RRF_K = 60
const RRF_MAX = 2 / (RRF_K + 1)

export interface HybridRow {
    content: string
    similarity: number
    vec_rank: number | null
    kw_rank: number | null
    kw_hits?: number | null
}

/** 두 순위를 RRF 로 합쳐 0~1 점수로 (두 목록 모두 1등 = 1) */
export function fuseRrf(row: Pick<HybridRow, 'vec_rank' | 'kw_rank'>): number {
    let s = 0
    if (typeof row.vec_rank === 'number' && row.vec_rank > 0) s += 1 / (RRF_K + row.vec_rank)
    if (typeof row.kw_rank === 'number' && row.kw_rank > 0) s += 1 / (RRF_K + row.kw_rank)
    return s / RRF_MAX
}

/** 낱말로만 걸린 조각도 벡터 유사도가 이 값보다 너무 낮으면 버린다 (흔한 낱말 하나로 엉뚱한 조각이 끼는 것 방지) */
const KEYWORD_ONLY_SIM_MARGIN = 0.10

/**
 * 벡터 유사도 기반 지식 검색 (+ 낱말 검색 합치기)
 *
 * queryText 를 같이 주면(대화 중 실제 사용자 말)
 *   1) 낱말 검색 후보를 더해 RRF 로 합친다 (HYBRID_SEARCH_ENABLED, 기본 켬)
 *   2) Q&A 로 넣은 조각 중 질문이 겹치는 것을 더 앞세운다.
 * 돌려주는 similarity 는 언제나 진짜 벡터 유사도다 (Strict 판정 기준이 바뀌지 않게).
 */
export async function matchKnowledge(
    db: SupabaseClient,
    queryEmbedding: number[],
    mentorId: string,
    threshold = 0.7,
    count = 5,
    queryText?: string,
    opts: { hybrid?: boolean } = {},
): Promise<MatchedKnowledge[]> {
    // 🛡 봇(mentor) 지정 없이 검색하면 다른 사람 자료가 섞인다. 빠지면 조용히 빈 배열이 아니라 예외.
    if (!mentorId || typeof mentorId !== 'string') {
        throw new Error('matchKnowledge: mentorId 는 필수다 (자료 격리)')
    }
    // Q&A 재순위를 매기려면 후보가 조금 더 있어야 한다(요청한 수만 받으면 다시 줄 세울 게 없다)
    const fetchCount = Math.min(Math.max(count * 3, count), 20)

    const terms = queryText && (opts.hybrid ?? hybridSearchEnabled()) ? keywordTerms(queryText) : []
    if (terms.length > 0) {
        try {
            const { data, error } = await db.rpc('match_knowledge_hybrid', {
                query_embedding: queryEmbedding,
                match_mentor_id: mentorId,
                query_terms: terms,
                query_text: queryText ?? '',
                match_threshold: threshold,
                match_count: fetchCount,
            })
            if (!error && Array.isArray(data)) {
                const floor = threshold - KEYWORD_ONLY_SIM_MARGIN
                const rows = (data as HybridRow[]).filter(r => r.vec_rank != null || (r.similarity ?? 0) >= floor)
                return rerankWithQa(
                    rows.map(r => ({ row: { content: r.content, similarity: r.similarity }, base: fuseRrf(r) })),
                    queryText, count,
                )
            }
            console.warn('[Knowledge] 하이브리드 검색 실패, 벡터 검색으로:', error?.message ?? 'no data')
        } catch (e) {
            console.warn('[Knowledge] 하이브리드 검색 실패, 벡터 검색으로:', e instanceof Error ? e.message : e)
        }
    }

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
        return rerankWithQa(rows.map(row => ({ row, base: row.similarity ?? 0 })), queryText, count)
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
