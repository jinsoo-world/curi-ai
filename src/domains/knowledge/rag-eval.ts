// 답 품질 관문 (검색 hit@5 + 선택적 답 검사) — 순수 함수만. 돈·DB 안 씀.
// 실행기: scripts/rag-eval.mjs, 문제 만들기: scripts/rag-eval-build.mjs, 사용법: docs/qa/rag-eval.md

export type GoldenType = 'fact' | 'price' | 'schedule' | 'name' | 'notin'

export interface GoldenItem {
    id: string
    mentorId: string
    botName?: string
    type: GoldenType
    question: string
    /** 위 5개 조각 중 하나에 이 말 중 하나라도 있으면 맞힘 (notin 은 비움) */
    expectAny: string[]
    /** 답 모드: 답에 꼭 있어야 하는 사실 (전부) */
    keyFacts?: string[]
}

export interface GoldenFixture {
    version: 1
    /** 40개 중 몇 개 이상 맞혀야 통과 (기본 32) */
    threshold?: number
    /** notin: 가장 가까운 조각 유사도가 이보다 낮으면 '자료에 없음'으로 맞힘 (기본 0.75) */
    notinMaxSim?: number
    items: GoldenItem[]
}

export interface Retrieved { content: string; similarity: number }

const norm = (s: string) => String(s ?? '').replace(/\s+/g, '').toLowerCase()

/** 검색 hit@5 */
export function retrievalHit(item: GoldenItem, top: Retrieved[], notinMaxSim = 0.75): boolean {
    const five = top.slice(0, 5)
    if (item.type === 'notin') return five.every(r => (r.similarity ?? 0) < notinMaxSim)
    const wants = item.expectAny.map(norm).filter(Boolean)
    if (wants.length === 0) return false
    return five.some(r => { const c = norm(r.content); return wants.some(w => c.includes(w)) })
}

const DONT_KNOW = /(모르|없(어|습|네|는)|찾을 수 없|확인(이|되지|할 수) (어렵|없|않)|자료에.{0,6}(없|안)|알 수 없|드리기 어렵)/

/** 답에 나온 숫자 중 자료(조각)나 질문에 없는 숫자 = 지어낸 숫자 */
export function inventedNumbers(answer: string, sources: string[], question = ''): string[] {
    const pool = norm(sources.join(' ') + ' ' + question).replace(/,/g, '')
    const nums = String(answer ?? '').match(/\d[\d,]*(\.\d+)?/g) ?? []
    const out: string[] = []
    for (const n of nums) {
        const k = n.replace(/,/g, '')
        if (k.length < 2) continue // 한 자리(1, 2 번째 등)는 흔해서 안 봄
        if (!pool.includes(k) && !out.includes(n)) out.push(n)
    }
    return out
}

export interface AnswerCheck { ok: boolean; missing: string[]; invented: string[]; saidDontKnow: boolean }

export function answerCheck(item: GoldenItem, answer: string, sources: string[]): AnswerCheck {
    const saidDontKnow = DONT_KNOW.test(answer ?? '')
    const invented = inventedNumbers(answer, sources, item.question)
    if (item.type === 'notin') return { ok: saidDontKnow && invented.length === 0, missing: [], invented, saidDontKnow }
    const a = norm(answer)
    const missing = (item.keyFacts ?? item.expectAny.slice(0, 1)).filter(f => !a.includes(norm(f)))
    return { ok: missing.length === 0 && invented.length === 0, missing, invented, saidDontKnow }
}

export interface ItemResult { id: string; type: GoldenType; hit: boolean; answerOk?: boolean; error?: string }

export function summarize(fixture: GoldenFixture, results: ItemResult[]) {
    const threshold = fixture.threshold ?? 32
    const hits = results.filter(r => r.hit).length
    const byType: Record<string, { hit: number; total: number }> = {}
    for (const r of results) {
        const t = (byType[r.type] ??= { hit: 0, total: 0 })
        t.total++; if (r.hit) t.hit++
    }
    const answered = results.filter(r => r.answerOk !== undefined)
    return {
        hits, total: results.length, threshold, pass: hits >= threshold, byType,
        answerOk: answered.length ? answered.filter(r => r.answerOk).length : undefined,
    }
}

/** 문제 파일 모양 검사 + 전화·메일 섞였는지 */
export function validateFixture(f: GoldenFixture): string[] {
    const errs: string[] = []
    if (!f || !Array.isArray(f.items)) return ['items 가 없음']
    const seen = new Set<string>()
    for (const it of f.items) {
        if (!it.id || seen.has(it.id)) errs.push(`id 중복/없음: ${it.id}`)
        seen.add(it.id)
        if (!it.mentorId || !it.question) errs.push(`${it.id}: mentorId/question 없음`)
        if (it.type !== 'notin' && !(it.expectAny?.length)) errs.push(`${it.id}: expectAny 없음`)
        const blob = JSON.stringify(it)
        if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(blob) || /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/.test(blob)) errs.push(`${it.id}: 전화·메일 섞임`)
    }
    return errs
}
