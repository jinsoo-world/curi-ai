// domains/knowledge = 고쳐 찾기 (대표 결정 0928, corrective retrieval)
//
// 자료 검색 결과가 시원찮을 때만(가장 가까운 조각의 유사도가 문턱 아래) 한 번 더 찾는다:
//   1) 솔라 미니에게 앞 대화를 보여 주고 마지막 질문을 검색어 한 줄로 다시 쓰게 한다 (3초 안에 못 쓰면 포기)
//   2) 그 검색어로 다시 찾고, 둘 중 더 가까운 결과를 쓴다
//   3) 그래도 없으면 예전과 똑같다 (Strict 봇은 「자료에 없어요」)
// 검색이 잘 되는 평소 질문에는 아무 일도 안 한다 = 평소 비용 그대로.
// 끄기: CORRECTIVE_RAG_ENABLED=false

import type { MatchedKnowledge } from './types'

export function correctiveRagEnabled(env: Record<string, string | undefined> = process.env): boolean {
    return String(env.CORRECTIVE_RAG_ENABLED ?? 'true').toLowerCase() !== 'false'
}

/** 가장 가까운 조각의 벡터 유사도 (없으면 0) */
export function bestSimilarity(matches: { similarity?: number | null }[] | null | undefined): number {
    return (matches ?? []).reduce((m, k) => Math.max(m, k.similarity ?? 0), 0)
}

export function needsCorrection(matches: { similarity?: number | null }[] | null | undefined, minSim: number): boolean {
    return bestSimilarity(matches) < minSim
}

export const REWRITE_SYSTEM = [
    '너는 자료 검색어를 다시 쓰는 도구다. 답을 하지 않는다.',
    '앞 대화를 보고 마지막 질문이 실제로 찾는 것을 자료 검색용 한 줄로 쓴다.',
    '그거, 거기, 그 사람 같은 가리키는 말은 앞 대화에 나온 이름으로 바꾼다.',
    '핵심 낱말(고유명사, 제품명, 숫자)을 살리고 인사나 군말은 뺀다. 40자 안쪽.',
    '검색어 한 줄만 쓴다. 따옴표, 설명, 머리말 없이.',
].join('\n')

export function buildRewriteInput(history: { role?: string; content?: unknown }[], question: string): string {
    const lines = (history ?? [])
        .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
        .slice(-6)
        .map(m => `${m.role === 'user' ? '사람' : '봇'}: ${String(m.content ?? '').replace(/\s+/g, ' ').slice(0, 300)}`)
    return `${lines.length ? `[앞 대화]\n${lines.join('\n')}\n\n` : ''}[마지막 질문]\n${String(question).slice(0, 500)}\n\n검색어:`
}

/** 모델이 쓴 검색어를 다듬는다. 쓸모없으면 null */
export function cleanRewrite(raw: string | null | undefined, original: string): string | null {
    if (!raw) return null
    let t = String(raw).split('\n').map(s => s.trim()).find(Boolean) ?? ''
    t = t.replace(/^(검색어|query)\s*[:：]\s*/i, '').replace(/^["'「『]+|["'」』]+$/g, '').trim().slice(0, 200)
    if (t.length < 2) return null
    const norm = (s: string) => s.replace(/[\s\p{P}]+/gu, '').toLowerCase()
    if (norm(t) === norm(original)) return null
    return t
}

export interface CorrectiveDeps {
    rewrite: (system: string, user: string) => Promise<string | null>
    embed: (text: string) => Promise<number[]>
    search: (embedding: number[], text: string) => Promise<MatchedKnowledge[]>
}

export interface CorrectiveOutcome {
    tried: boolean
    used: boolean
    rewritten: string | null
    matches: MatchedKnowledge[]
    bestBefore: number
    bestAfter: number | null
}

/** 시원찮을 때만 한 번 고쳐 찾는다. 어디서 실패해도 원래 결과를 그대로 돌려준다 (절대 던지지 않는다) */
export async function correctiveRetrieve(
    deps: CorrectiveDeps,
    input: { question: string; history: { role?: string; content?: unknown }[]; original: MatchedKnowledge[]; minSim: number; enabled?: boolean },
): Promise<CorrectiveOutcome> {
    const bestBefore = bestSimilarity(input.original)
    const keep: CorrectiveOutcome = { tried: false, used: false, rewritten: null, matches: input.original, bestBefore, bestAfter: null }
    if (!(input.enabled ?? correctiveRagEnabled()) || !needsCorrection(input.original, input.minSim)) return keep
    try {
        const rewritten = cleanRewrite(await deps.rewrite(REWRITE_SYSTEM, buildRewriteInput(input.history, input.question)), input.question)
        if (!rewritten) return { ...keep, tried: true }
        const emb = await deps.embed(rewritten)
        if (!emb.length) return { ...keep, tried: true, rewritten }
        const again = await deps.search(emb, rewritten)
        const bestAfter = bestSimilarity(again)
        const better = again.length > 0 && bestAfter > bestBefore
        return { tried: true, used: better, rewritten, matches: better ? again : input.original, bestBefore, bestAfter }
    } catch (e) {
        console.warn('[corrective] 고쳐 찾기 실패, 원래 결과로:', e instanceof Error ? e.message : e)
        return { ...keep, tried: true }
    }
}
