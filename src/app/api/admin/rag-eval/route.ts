// 검색 품질 비교 (관리자 전용, 임시)
//
// 주소를 불러도 아무것도 돌려주지 않는다. 관리자가 DB(rag_eval_runs, 서버 전용 표)에 넣어 둔
// 'pending' 한 건만 처리해서 결과를 그 줄에 다시 적는다. 넣어 둔 게 없으면 아무 일도 안 한다.
// 요청 모양: { queries: [{ mentorId, query }], pairs: [[말1, 말2]] }. 한 번에 최대 15개씩.
// pairs = 두 말의 임베딩 유사도 (의미 답 저장소 문턱 맞추기용)
// corrective = [{ mentorId, question, history }] 고쳐 찾기 전후 비교 (솔라 미니를 실제로 부른다)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding, matchKnowledge } from '@/domains/knowledge'
import { correctiveRetrieve } from '@/domains/knowledge/corrective'
import { askSolar } from '@/domains/agent/ask'
import { SOLAR_MINI_MODEL } from '@/domains/llm/constants'
import { STRICT_MIN_SIMILARITY } from '@/domains/os/response-settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const short = (s: string) => s.replace(/\s+/g, ' ').slice(0, 80)
function cosine(a: number[], b: number[]): number {
    let d = 0, na = 0, nb = 0
    for (let i = 0; i < Math.min(a.length, b.length); i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return na && nb ? d / Math.sqrt(na * nb) : 0
}

export async function POST() {
    const db = createAdminClient()
    const { data: pending } = await db.from('rag_eval_runs').select('id').eq('status', 'pending').order('id').limit(1)
    const id = pending?.[0]?.id
    if (!id) return NextResponse.json({ processed: 0 })
    const { data: claimed } = await db.from('rag_eval_runs').update({ status: 'running' }).eq('id', id).eq('status', 'pending').select('request').single()
    if (!claimed) return NextResponse.json({ processed: 0 })

    const queries = ((claimed.request as { queries?: { mentorId: string; query: string }[] })?.queries ?? []).slice(0, 15)
    const results = []
    for (const q of queries) {
        try {
            const emb = await generateEmbedding(q.query, { route: '/api/admin/rag-eval', mentorId: q.mentorId })
            const before = await matchKnowledge(db, emb, q.mentorId, 0.7, 5, q.query, { hybrid: false })
            const after = await matchKnowledge(db, emb, q.mentorId, 0.7, 5, q.query, { hybrid: true })
            const best = await matchKnowledge(db, emb, q.mentorId, 0, 3, undefined, { hybrid: false })
            results.push({
                mentorId: q.mentorId, query: q.query,
                bestSim: best.map(b => Number(b.similarity.toFixed(3))),
                before: before.map(b => `${b.similarity.toFixed(3)} ${short(b.content)}`),
                after: after.map(b => `${b.similarity.toFixed(3)} ${short(b.content)}`),
            })
        } catch (e) {
            results.push({ mentorId: q.mentorId, query: q.query, error: e instanceof Error ? e.message : String(e) })
        }
    }
    const pairs = ((claimed.request as { pairs?: [string, string][] })?.pairs ?? []).slice(0, 15)
    const pairResults = []
    for (const [a, b] of pairs) {
        try {
            const [ea, eb] = [await generateEmbedding(a, { route: '/api/admin/rag-eval' }), await generateEmbedding(b, { route: '/api/admin/rag-eval' })]
            pairResults.push({ a, b, similarity: Number(cosine(ea, eb).toFixed(4)) })
        } catch (e) {
            pairResults.push({ a, b, error: e instanceof Error ? e.message : String(e) })
        }
    }
    type Turn = { role: string; content: string }
    const cases = ((claimed.request as { corrective?: { mentorId: string; question: string; history?: Turn[] }[] })?.corrective ?? []).slice(0, 10)
    const correctiveResults = []
    for (const c of cases) {
        try {
            const route = '/api/admin/rag-eval'
            const emb = await generateEmbedding(c.question, { route, mentorId: c.mentorId })
            const original = await matchKnowledge(db, emb, c.mentorId, 0.7, 5, c.question)
            const started = Date.now()
            const out = await correctiveRetrieve({
                rewrite: (sys, u) => askSolar(sys, u, { model: SOLAR_MINI_MODEL, temperature: 0, maxTokens: 60, signal: AbortSignal.timeout(3_000), usage: { route, kind: 'rewrite', mentorId: c.mentorId } }),
                embed: t => generateEmbedding(t, { route, mentorId: c.mentorId }),
                search: (e, t) => matchKnowledge(db, e, c.mentorId, 0.7, 5, t),
            }, { question: c.question, history: c.history ?? [], original, minSim: STRICT_MIN_SIMILARITY, enabled: true })
            correctiveResults.push({
                mentorId: c.mentorId, question: c.question, ms: Date.now() - started,
                tried: out.tried, used: out.used, rewritten: out.rewritten, bestBefore: out.bestBefore, bestAfter: out.bestAfter,
                before: original.map(b => `${b.similarity.toFixed(3)} ${short(b.content)}`),
                after: out.matches.map(b => `${b.similarity.toFixed(3)} ${short(b.content)}`),
            })
        } catch (e) {
            correctiveResults.push({ mentorId: c.mentorId, question: c.question, error: e instanceof Error ? e.message : String(e) })
        }
    }
    await db.from('rag_eval_runs').update({ status: 'done', result: { queries: results, pairs: pairResults, corrective: correctiveResults }, finished_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ processed: 1 })
}
