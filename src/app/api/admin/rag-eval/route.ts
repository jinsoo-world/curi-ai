// 검색 품질 비교 (관리자 전용, 임시)
//
// 주소를 불러도 아무것도 돌려주지 않는다. 관리자가 DB(rag_eval_runs, 서버 전용 표)에 넣어 둔
// 'pending' 한 건만 처리해서 결과를 그 줄에 다시 적는다. 넣어 둔 게 없으면 아무 일도 안 한다.
// 요청 모양: { queries: [{ mentorId, query }], pairs: [[말1, 말2]] }. 한 번에 최대 15개씩.
// pairs = 두 말의 임베딩 유사도 (의미 답 저장소 문턱 맞추기용)
// corrective = [{ mentorId, question, history }] 고쳐 찾기 전후 비교 (솔라 미니를 실제로 부른다)
// models = ['모델 이름'] 구글에 그 모델이 아직 있는지만 본다 (돈 안 듦)
// image = { model: 'fast' | 'pro', prompt, aspectRatio } 사진 한 장을 실제로 만든다 (한도와 기록을 그대로 탄다)
// chat = { question, recencyOn } 대화 답 한 번 (누가 답했나, 되돌아간 까닭, 검색 횟수 기록 확인)
// side = { kind, prompt } 곁일 입구 한 번 (SIDE_TEXT_PROVIDER 확인)

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateEmbedding, matchKnowledge } from '@/domains/knowledge'
import { correctiveRetrieve } from '@/domains/knowledge/corrective'
import { askQuickWithFallback } from '@/domains/agent/ask'
import { STRICT_MIN_SIMILARITY } from '@/domains/os/response-settings'
import { GoogleGenAI } from '@google/genai'
import sharp from 'sharp'
import { IMAGE_MODEL_FAST, IMAGE_MODEL_PRO } from '@/domains/studio/image-models'
import { checkImageCap, logImageGeneration } from '@/domains/studio/image-usage'
import { generateChatStream } from '@/domains/chat/stream'
import { askSideText, sideTextProvider } from '@/domains/llm/side-text'

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
                rewrite: (sys, u) => askQuickWithFallback(sys, u, { timeoutMs: 3_000, maxTokens: 60, usage: { route, kind: 'rewrite', mentorId: c.mentorId } }),
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
    const req = claimed.request as {
        models?: string[]
        image?: { model?: 'fast' | 'pro'; prompt?: string; aspectRatio?: string }
        chat?: { question?: string; recencyOn?: boolean }
        side?: { kind?: string; prompt?: string }
    }
    const route = '/api/admin/rag-eval'
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    const modelResults = []
    for (const name of (req.models ?? []).slice(0, 10)) {
        try {
            const m = await ai.models.get({ model: String(name) })
            modelResults.push({ name, ok: true, got: m.name, displayName: m.displayName ?? null })
        } catch (e) {
            modelResults.push({ name, ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) })
        }
    }
    let imageResult: Record<string, unknown> | null = null
    if (req.image?.prompt) {
        const model = req.image.model === 'pro' ? IMAGE_MODEL_PRO : IMAGE_MODEL_FAST
        const cap = await checkImageCap(db, { route })
        if (cap) imageResult = { model, blocked: cap }
        else {
            const started = Date.now()
            try {
                const r = await ai.models.generateContent({
                    model,
                    config: req.image.aspectRatio ? { imageConfig: { aspectRatio: req.image.aspectRatio } } : {},
                    contents: [{ role: 'user', parts: [{ text: String(req.image.prompt).slice(0, 500) }] }],
                })
                const part = (r.candidates?.[0]?.content?.parts ?? []).find((p: { inlineData?: { data?: string } }) => p.inlineData?.data) as { inlineData: { data: string; mimeType?: string } } | undefined
                logImageGeneration({ route, model, images: part ? 1 : 0, ok: !!part, usageMetadata: r.usageMetadata, latencyMs: Date.now() - started, meta: { who: 'admin-eval' }, error: part ? null : 'no image part' })
                if (part) {
                    const buf = Buffer.from(part.inlineData.data, 'base64')
                    const meta = await sharp(buf).metadata()
                    const preview = await sharp(buf).resize(256).jpeg({ quality: 70 }).toBuffer()
                    imageResult = { model, ok: true, ms: Date.now() - started, bytes: buf.length, mime: part.inlineData.mimeType ?? null, width: meta.width, height: meta.height, usage: r.usageMetadata ?? null, previewJpeg64: preview.toString('base64') }
                } else {
                    imageResult = { model, ok: false, ms: Date.now() - started, text: (r.text ?? '').slice(0, 200) }
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                logImageGeneration({ route, model, images: 0, ok: false, error: msg, latencyMs: Date.now() - started, meta: { who: 'admin-eval' } })
                imageResult = { model, ok: false, error: msg.slice(0, 300) }
            }
        }
    }
    let chatResult: Record<string, unknown> | null = null
    if (req.chat?.question) {
        const started = Date.now()
        let text = ''
        let answer: unknown = null
        for await (const c of await generateChatStream('너는 짧게 답하는 도우미다. 두 문장 이내.', [{ role: 'user', parts: [{ text: String(req.chat.question).slice(0, 300) }] }], { maxOutputTokens: 300, recencyOn: req.chat.recencyOn !== false, usage: { route, kind: 'chat' } })) {
            if (c.text) text += c.text
            if ('answer' in c && c.answer) answer = c.answer
        }
        chatResult = { ms: Date.now() - started, answer, text: text.slice(0, 300) }
    }
    let sideResult: Record<string, unknown> | null = null
    if (req.side?.prompt) {
        const started = Date.now()
        try {
            const out = await askSideText({ kind: String(req.side.kind ?? 'side-test'), route, geminiModel: 'gemini-3.5-flash-lite', maxTokens: 200, prompt: String(req.side.prompt).slice(0, 500) })
            sideResult = { provider: sideTextProvider(), ms: Date.now() - started, text: (out ?? '').slice(0, 300) }
        } catch (e) {
            sideResult = { provider: sideTextProvider(), error: e instanceof Error ? e.message : String(e) }
        }
    }
    await db.from('rag_eval_runs').update({ status: 'done', result: { queries: results, pairs: pairResults, corrective: correctiveResults, models: modelResults, image: imageResult, chat: chatResult, side: sideResult }, finished_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ processed: 1 })
}
