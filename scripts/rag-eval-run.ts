// 답 품질 관문: 문제마다 검색(hit@5), --answer 면 솔라 미니로 답도 만들어 검사.
// 검색만 = 임베딩 40번(거의 0원). 답 모드 = 솔라 미니 40번(수십 원).
// DB 에 쓰는 건 rag_eval_runs 한 줄뿐 (표가 없으면 건너뜀).
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { matchKnowledge } from '../src/domains/knowledge/queries'
import { retrievalHit, answerCheck, summarize, validateFixture, type GoldenFixture, type ItemResult } from '../src/domains/knowledge/rag-eval'
import { loadEnv } from './rag-eval-env.mjs'

loadEnv()
const argv = process.argv.slice(2).filter(a => a !== '--')
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const file = arg('--fixture') ?? 'docs/qa/rag-eval-golden.json'
const answerMode = argv.includes('--answer')
const noWrite = argv.includes('--no-write')

async function main() {
    const fixture = JSON.parse(fs.readFileSync(file, 'utf8')) as GoldenFixture
    const errs = validateFixture(fixture)
    if (errs.length) { console.error('문제 파일 오류:\n' + errs.join('\n')); process.exit(2) }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key || url.includes("dummy") || !process.env.GEMINI_API_KEY) { console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY 필요'); process.exit(2) }
    const db = createClient(url, key, { auth: { persistSession: false } })
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const embed = async (t: string) => (await ai.models.embedContent({ model: 'gemini-embedding-001', contents: t, config: { outputDimensionality: 768 } })).embeddings?.[0]?.values ?? []

    const results: (ItemResult & { top?: string })[] = []
    for (const it of fixture.items) {
        try {
            const emb = await embed(it.question)
            // 실제 대화와 같은 길: 문턱 0.7, 5개, 낱말 검색 합치기
            const top = await matchKnowledge(db, emb, it.mentorId, it.type === 'notin' ? 0 : 0.7, 5, it.question, { hybrid: true })
            const r: ItemResult & { top?: string } = { id: it.id, type: it.type, hit: retrievalHit(it, top, fixture.notinMaxSim), top: top[0]?.content.replace(/\s+/g, ' ').slice(0, 40) }
            if (answerMode) {
                const answer = await askSolar(it.question, top.map(t => t.content))
                r.answerOk = answerCheck(it, answer, top.map(t => t.content)).ok
            }
            results.push(r)
        } catch (e) {
            results.push({ id: it.id, type: it.type, hit: false, error: e instanceof Error ? e.message : String(e) })
        }
    }
    const s = summarize(fixture, results)
    console.table(results.map(r => ({ id: r.id, 종류: r.type, 검색: r.hit ? 'O' : 'X', ...(answerMode ? { 답: r.answerOk ? 'O' : 'X' } : {}), 첫조각: r.error ?? r.top ?? '' })))
    console.log('종류별:', Object.entries(s.byType).map(([t, v]) => `${t} ${v.hit}/${v.total}`).join(' · '))
    console.log(`검색 hit@5 = ${s.hits} / ${s.total} (기준 ${s.threshold}) → ${s.pass ? '통과' : '불합격'}` + (s.answerOk !== undefined ? ` · 답 검사 ${s.answerOk}/${s.total}` : ''))
    if (!noWrite) {
        const { error } = await db.from('rag_eval_runs').insert({ status: 'golden', request: { fixture: file, answerMode }, result: { summary: s, results }, finished_at: new Date().toISOString() })
        if (error) console.warn('rag_eval_runs 기록 건너뜀:', error.message)
    }
    process.exit(s.pass ? 0 : 1)
}

async function askSolar(question: string, chunks: string[]): Promise<string> {
    const r = await fetch('https://api.upstage.ai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.UPSTAGE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: process.env.LLM_MODEL_MINI || 'solar-mini', max_tokens: 300, temperature: 0,
            messages: [
                { role: 'system', content: '아래 자료로만 짧게 답해. 자료에 없으면 모른다고 말해. 숫자를 지어내지 마.\n\n[자료]\n' + chunks.join('\n---\n') },
                { role: 'user', content: question },
            ],
        }),
    })
    const j = await r.json() as { choices?: { message?: { content?: string } }[] }
    return j.choices?.[0]?.message?.content ?? ''
}

main()
