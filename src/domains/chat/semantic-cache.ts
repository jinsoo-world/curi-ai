// domains/chat = 의미 답 저장소 (대표 결정 0928)
//
// 같은 봇에 거의 같은 첫 질문이 오면 모델을 다시 부르지 않고 저장해 둔 답을 쓴다.
// 틀린 저장 답은 답이 없는 것보다 나쁘다. 그래서 아주 좁게만 쓴다:
//   - 첫 질문일 때만 (앞 대화에 기대는 말은 안 쓴다)
//   - 그 사람의 기억, 프로필, 고민, 스킬이 들어간 대화는 쓰지도 저장하지도 않는다
//   - 링크를 읽는 말, 사진, 노션이나 큐리어스 부르기, 지침 빼내기 시도는 제외
//   - 오늘, 요즘, 최근, 날씨처럼 시간 따라 답이 바뀌는 말은 제외
//   - 봇 자료에서 충분히 가까운 조각을 찾은 질문만 (자료에 기댄 답)
//   - 솔라가 끝까지 답했고(웹 검색 없음) 응답 필터가 안 끊은 답만 저장
//   - 칸막이: 봇(mentor_id) + 공개/주인별 칸 + 봇 지침과 자료의 지문. 지침이나 자료가 바뀌면 예전 답은 안 쓰인다
//   - 유사도 0.96 이상, 7일 지나면 버린다
// 끄기: SEMANTIC_CACHE_ENABLED=false

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export function semanticCacheEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return String(env.SEMANTIC_CACHE_ENABLED ?? 'true').toLowerCase() !== 'false'
}

/**
 * 이 이상 가까워야 같은 질문으로 본다. 환경변수로 올릴 수는 있어도 0.95 아래로는 못 내린다.
 * 실측 0928 (gemini-embedding-001, 실제 자료 질문): 같은 뜻 바꿔 말하기 0.955~0.995,
 * 다른 뜻인데 비슷한 말 0.74~0.93 (「수강 대상이 누구예요」 대 「수강 대상이 아닌 사람은」 0.929). 그래서 여유를 두고 0.96.
 */
export function cacheMinSimilarity(env: Record<string, string | undefined> = process.env): number {
    const v = Number(env.SEMANTIC_CACHE_MIN_SIM)
    return Number.isFinite(v) && v >= 0.95 && v < 1 ? v : 0.96
}

export function cacheTtlDays(env: Record<string, string | undefined> = process.env): number {
    const v = Number(env.SEMANTIC_CACHE_TTL_DAYS)
    return Number.isFinite(v) && v > 0 && v <= 30 ? v : 7
}

/** 저장 규칙이 바뀌면 올린다 (예전 저장 답을 한꺼번에 버리는 효과) */
const CACHE_SCHEMA = 1

// 시간 따라 답이 바뀌는 말
const TIME_SENSITIVE = /오늘|내일|어제|모레|지금|요즘|최근|현재|올해|작년|내년|이번\s*(주|달|해|달)|다음\s*(주|달)|지난\s*(주|달)|날짜|요일|몇\s*시|시각|날씨|뉴스|최신|속보|주가|환율|며칠|디데이|d-?day|today|tomorrow|yesterday|\bnow\b|latest|news|weather|price/i
// 연결 도구나 개인 자료를 부르는 말
const PERSONAL_TOOLS = /노션|notion|큐리어스|어울림|curious|내\s*(일정|메일|파일|자료함)/i

export interface CacheCheckInput {
    enabled: boolean
    /** 이번 요청에 들어온 사용자 말 수 (첫 질문이면 1) */
    userTurns: number
    text: string
    hasLink: boolean
    hasImage: boolean
    personalized: boolean
    extractionAttempt: boolean
    topSimilarity: number | null
    /** 이 이상이어야 자료에 기댄 답으로 본다 (Strict 문턱과 같게) */
    minKnowledgeSimilarity: number
    hasEmbedding: boolean
}

/** 이 요청에 저장 답을 써도(또는 저장해도) 되나. 안 되면 이유 */
export function cacheEligibility(i: CacheCheckInput): { ok: true } | { ok: false; reason: string } {
    if (!i.enabled) return { ok: false, reason: 'off' }
    if (!i.hasEmbedding) return { ok: false, reason: 'no-embedding' }
    if (i.userTurns !== 1) return { ok: false, reason: 'not-first-turn' }
    const t = String(i.text ?? '').trim()
    if (t.length < 4 || t.length > 300) return { ok: false, reason: 'length' }
    if (i.hasLink) return { ok: false, reason: 'link' }
    if (i.hasImage) return { ok: false, reason: 'image' }
    if (i.personalized) return { ok: false, reason: 'personal' }
    if (i.extractionAttempt) return { ok: false, reason: 'extraction' }
    if (TIME_SENSITIVE.test(t)) return { ok: false, reason: 'time-sensitive' }
    if (PERSONAL_TOOLS.test(t)) return { ok: false, reason: 'personal-tool' }
    if (i.topSimilarity === null || i.topSimilarity < i.minKnowledgeSimilarity) return { ok: false, reason: 'weak-knowledge' }
    return { ok: true }
}

/** 공개 봇은 모두 한 칸, 개인 봇은 주인별 칸 (다른 주인의 개인 봇끼리 절대 안 섞인다) */
export function cacheScopeKey(kind: 'public' | 'personal' | string, userId: string | null | undefined): string | null {
    if (kind === 'public') return 'public'
    return userId ? `owner:${userId}` : null
}

/** 봇 지침 지문. 매 요청 바뀌는 「지금 시각」 줄은 뺀다 */
export function botVersion(parts: { systemPrompt: string; settings: unknown; knowledgeVersion: string; model: string }): string {
    const prompt = parts.systemPrompt.replace(/^오늘은 .* 입니다\.$/m, '')
    return createHash('sha256')
        .update(JSON.stringify({ v: CACHE_SCHEMA, prompt, settings: parts.settings ?? null, k: parts.knowledgeVersion, m: parts.model }))
        .digest('hex')
        .slice(0, 32)
}

/**
 * 저장해도 되는 답인가 (끝까지 나왔고, 필터가 안 끊었고, 쉬는 중 문구가 아님, 답한 곳이 괜찮음).
 *
 * 답한 곳: 솔라 답은 저장한다. Gemini 답은 구글 검색을 안 쓴 경우만 저장한다 (0928 결정).
 *   처음 솔라만 받은 까닭은 Gemini 쪽에 검색 도구가 붙어 있어서다. 검색으로 가져온 바깥 소식은
 *   며칠 지나면 틀릴 수 있어 7일 동안 다시 내주면 안 된다. 검색을 안 쓴 Gemini 답은 솔라 답과 같은
 *   지침, 같은 자료로 만든 답이라 막을 까닭이 없다. 끄기: SEMANTIC_CACHE_ALLOW_GEMINI=false
 */
export function isStorableAnswer(a: {
    text: string; guardTripped: boolean; unavailableText: string
    answeredBy: { provider: 'solar' | 'gemini'; searched: boolean } | null
    allowGemini?: boolean
}): boolean {
    const t = a.text.trim()
    if (a.guardTripped || t.length < 20 || t.length > 8000 || t === a.unavailableText) return false
    if (!a.answeredBy) return false
    if (a.answeredBy.provider === 'solar') return true
    return a.allowGemini !== false && !a.answeredBy.searched
}

export function cacheAllowsGemini(env: Record<string, string | undefined> = process.env): boolean {
    return String(env.SEMANTIC_CACHE_ALLOW_GEMINI ?? 'true').toLowerCase() !== 'false'
}

export async function knowledgeVersion(db: SupabaseClient, mentorId: string): Promise<string | null> {
    const { data, error } = await db.rpc('knowledge_version', { p_mentor: mentorId })
    if (error || typeof data !== 'string') return null
    return data
}

export async function lookupCachedAnswer(
    db: SupabaseClient,
    q: { embedding: number[]; mentorId: string; scopeKey: string; version: string; minSim?: number },
): Promise<{ id: number; answer: string; similarity: number } | null> {
    const { data, error } = await db.rpc('match_answer_cache', {
        p_embedding: q.embedding, p_mentor: q.mentorId, p_scope: q.scopeKey, p_version: q.version,
        p_min_sim: q.minSim ?? cacheMinSimilarity(),
    })
    if (error) { console.warn('[semantic-cache] 찾기 실패:', error.message); return null }
    const row = Array.isArray(data) ? data[0] : null
    return row && typeof row.answer === 'string' ? row : null
}

export async function storeCachedAnswer(
    db: SupabaseClient,
    e: { embedding: number[]; mentorId: string; scopeKey: string; version: string; question: string; answer: string },
): Promise<void> {
    const expires = new Date(Date.now() + cacheTtlDays() * 86_400_000).toISOString()
    const { error } = await db.from('semantic_answer_cache').insert({
        mentor_id: e.mentorId, scope_key: e.scopeKey, bot_version: e.version, embedding: e.embedding,
        question: e.question.slice(0, 300), answer: e.answer, expires_at: expires,
    })
    if (error) console.warn('[semantic-cache] 저장 실패:', error.message)
}

/** 저장 답을 스트림처럼 흘려준다 (대화 API 의 나머지 흐름을 그대로 쓰려고) */
export async function* cachedAnswerStream(answer: string): AsyncGenerator<{ text?: string; usage?: null }> {
    yield { text: answer }
}
