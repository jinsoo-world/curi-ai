// 깊게 만들기 — 입력, 결과 정리(실존 인물 한 줄·30,000자), 점수, 미리보기 잘림, 끊김 판정, 단계 작업
import { describe, it, expect, vi, beforeEach } from 'vitest'

const generate = vi.fn()
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent: (...a: unknown[]) => generate(...a) } } }))
vi.mock('@/domains/os/readers', () => ({
    KNOWLEDGE_READ_OPTIONS: { maxBytes: 1, timeoutMs: 1, maxChars: 1 },
    readUrl: async (u: string) => ({ ok: true, url: u, requestedUrl: u, title: '참고 글', text: '링크 본문 '.repeat(50), kind: 'web' }),
}))

import {
    cleanDeepInput, parseWriteResult, scoreFidelity, deepJobView, needsKick, runDeepJob, disclaimerLine, gradeOf,
    DEEP_PREVIEW_CHARS, DEEP_STALE_MS, type DeepJob,
} from '@/domains/os/deep-create'
import { SYSTEM_PROMPT_MAX } from '@/domains/mentor/system-prompt'

const body = '## 역할 규칙\n' + '생각하는 방식을 옮긴다. '.repeat(40)
const writeJson = (over: Record<string, unknown> = {}) => JSON.stringify({
    kind: 'person', subjectName: '스티브 잡스', isRealPerson: true, name: '잡스 기획 봇', oneLiner: '제품을 덜어내는 기획', greeting: '무엇을 덜어낼까요?',
    sampleQuestions: ['a', 'b', 'c', 'd'], promptText: body,
    checks: { stance: [{ q: '버튼 수는?', expected: '최소' }, { q: 'q2', expected: 'e2' }, { q: 'q3', expected: 'e3' }], outOfScope: '암호화폐는?', style: '자기소개' },
    ...over,
})

function job(over: Partial<DeepJob> = {}): DeepJob {
    return {
        id: 'j1', user_id: 'u1', plan: 'basic', status: 'done', idea: '잡스 같은 기획 봇', ref_links: [], ref_text: null,
        research: { notes: 'n', sources: [{ url: 'https://a', title: 'A' }], material: '' },
        result: parseWriteResult(writeJson()), fidelity: { total: 80, grade: 'B', items: [], weaknesses: ['약점'] },
        error: null, claimed_at: null, saved_at: null, mentor_id: null, created_at: '2026-10-08T00:00:00Z', ...over,
    }
}

describe('cleanDeepInput', () => {
    it('빈 글·201자·링크 4개·긴 참고 글은 막는다', () => {
        expect(cleanDeepInput({}).ok).toBe(false)
        expect(cleanDeepInput({ idea: '가'.repeat(201) }).ok).toBe(false)
        expect(cleanDeepInput({ idea: '세무 봇', links: ['https://a', 'https://b', 'https://c', 'https://d'] }).ok).toBe(false)
        expect(cleanDeepInput({ idea: '세무 봇', refText: 'x'.repeat(20_001) }).ok).toBe(false)
    })
    it('http 링크만 남기고 겹친 건 하나로', () => {
        const r = cleanDeepInput({ idea: '  세무   상담 봇 ', links: ['https://a', 'https://a', 'ftp://x', 'javascript:1'] })
        expect(r).toEqual({ ok: true, input: { idea: '세무 상담 봇', links: ['https://a'], refText: '' } })
    })
})

describe('parseWriteResult', () => {
    it('실존 인물이면 맨 앞에 서버가 「본인 아님」 한 줄을 붙인다', () => {
        const r = parseWriteResult(writeJson())!
        expect(r.promptText.startsWith(disclaimerLine('스티브 잡스'))).toBe(true)
        expect(r.promptText).toContain('본인이 아니라')
        expect(r.sampleQuestions).toHaveLength(3)
    })
    it('분야 봇이면 붙이지 않는다', () => {
        const r = parseWriteResult(writeJson({ kind: 'topic', isRealPerson: false, subjectName: '세무' }))!
        expect(r.promptText.startsWith('## 역할 규칙')).toBe(true)
    })
    it('30,000자를 넘으면 30,000자로 맞춘다 (한도 상수 사용)', () => {
        const r = parseWriteResult(writeJson({ promptText: '가'.repeat(40_000) }))!
        expect([...r.promptText].length).toBe(SYSTEM_PROMPT_MAX)
    })
    it('JSON 아님·본문 너무 짧음은 null', () => {
        expect(parseWriteResult('not json')).toBeNull()
        expect(parseWriteResult(writeJson({ promptText: '짧다' }))).toBeNull()
    })
})

describe('scoreFidelity', () => {
    it('칸별 상한으로 자르고 합계·등급은 서버가 낸다', () => {
        const f = scoreFidelity({ stance: 99, style: 15, edge: -3, source: 10, structure: 12.4, weaknesses: ['a', 'b', 'c', 'd'] })!
        expect(f.items.map(i => i.score)).toEqual([30, 15, 0, 10, 12])
        expect(f.total).toBe(67)
        expect(f.grade).toBe('C')
        expect(f.weaknesses).toHaveLength(3)
    })
    it('등급 경계', () => {
        expect([gradeOf(85), gradeOf(84), gradeOf(70), gradeOf(69), gradeOf(55), gradeOf(54)]).toEqual(['A', 'B', 'B', 'C', 'C', 'D'])
    })
})

describe('deepJobView', () => {
    it('무료: 지시문 앞 600자 + 점수만, paywall true, 전문·약점·출처 없음', () => {
        const long = job({ result: { ...job().result!, promptText: '가'.repeat(5_000) } })
        const v = deepJobView(long, 'free')
        expect(v.paywall).toBe(true)
        expect(v.result).toMatchObject({ preview: true, promptChars: 5_000 })
        expect([...(v.result as { promptPreview: string }).promptPreview].length).toBe(DEEP_PREVIEW_CHARS)
        expect(v.result).not.toHaveProperty('promptText')
        expect(v.fidelity).toEqual({ total: 80, grade: 'B' })
        expect(JSON.stringify(v)).not.toContain('약점')
    })
    it('구독자: 전문·약점·출처까지', () => {
        const v = deepJobView(job(), 'pro')
        expect(v.paywall).toBe(false)
        expect(v.result).toHaveProperty('promptText')
        expect(v.fidelity).toMatchObject({ weaknesses: ['약점'] })
        expect((v.result as { sources: unknown[] }).sources).toHaveLength(1)
    })
    it('도는 중이면 결과 없음, 실패면 이유', () => {
        expect(deepJobView(job({ status: 'write' }), 'pro')).toMatchObject({ stage: '정리 중', result: null })
        expect(deepJobView(job({ status: 'failed', error: '시간 초과' }), 'free')).toMatchObject({ error: '시간 초과' })
    })
})

describe('needsKick', () => {
    const now = new Date('2026-10-08T00:10:00Z')
    it('도는 단계인데 아무도 안 잡았거나 오래됐으면 이어서 돈다', () => {
        expect(needsKick({ status: 'research', claimed_at: null }, now)).toBe(true)
        expect(needsKick({ status: 'write', claimed_at: new Date(now.getTime() - DEEP_STALE_MS - 1).toISOString() }, now)).toBe(true)
        expect(needsKick({ status: 'write', claimed_at: new Date(now.getTime() - 1_000).toISOString() }, now)).toBe(false)
        expect(needsKick({ status: 'done', claimed_at: null }, now)).toBe(false)
    })
})

// ── 단계 작업: 아주 작은 가짜 DB (줄 하나) ──
function fakeDb(row: Record<string, unknown>) {
    const db = {
        row,
        from: () => {
            let patch: Record<string, unknown> | null = null
            const filters: ((r: Record<string, unknown>) => boolean)[] = []
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.update = (p: Record<string, unknown>) => { patch = p; return q }
            q.eq = (k: string, v: unknown) => { filters.push(r => r[k] === v); return q }
            q.or = (expr: string) => {
                const stale = expr.split('claimed_at.lt.')[1]
                filters.push(r => r.claimed_at === null || String(r.claimed_at) < stale)
                return q
            }
            const run = () => {
                const hit = filters.every(f => f(db.row))
                if (hit && patch) db.row = { ...db.row, ...patch }
                return hit
            }
            q.maybeSingle = async () => ({ data: run() ? { ...db.row } : null, error: null })
            q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: run() ? [{ id: db.row.id }] : [], error: null }).then(res)
            return q
        },
    }
    return db
}

describe('runDeepJob', () => {
    beforeEach(() => generate.mockReset())

    it('조사 → 정리 → 점검을 차례로 돌고 done, 출처 주소를 모은다. 조사엔 구글 검색, 점검은 답하는 쪽·매기는 쪽 따로', async () => {
        generate
            .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: '유형: 인물\n' + '조사 '.repeat(100) }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://w1', title: 'W1' } }], webSearchQueries: ['잡스'] } }] })
            .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: writeJson() }] } }] })
            .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: '[1] 답' }] } }] })
            .mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: JSON.stringify({ stance: 24, style: 16, edge: 20, source: 10, structure: 12, weaknesses: ['출처 부족'] }) }] } }] })
        const db = fakeDb({ ...job({ status: 'research', research: null, result: null, fidelity: null, ref_links: ['https://ref'] }) })
        await runDeepJob(db as never, 'j1', { deadline: Date.now() + 290_000 })
        expect(db.row.status).toBe('done')
        expect((db.row.research as { sources: { url: string }[] }).sources.map(s => s.url)).toEqual(['https://ref', 'https://w1'])
        expect((db.row.fidelity as { total: number; grade: string })).toMatchObject({ total: 82, grade: 'B' })
        expect(generate.mock.calls[0][0].config.tools).toEqual([{ googleSearch: {} }])
        expect(generate.mock.calls[0][0].model).toBe('gemini-3.8-flash')
        expect(generate.mock.calls[2][0].config.systemInstruction).toContain('본인이 아니라')
        expect(generate.mock.calls[2][0].model).not.toBe(generate.mock.calls[3][0].model)
        expect(db.row.claimed_at).toBeNull()
    })

    it('정리가 틀리면 failed + 이유, 점검 답이 틀리면 결과는 두고 점수만 비움', async () => {
        generate.mockResolvedValueOnce({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })
        const db = fakeDb({ ...job({ status: 'write', result: null, fidelity: null }) })
        await runDeepJob(db as never, 'j1')
        expect(db.row).toMatchObject({ status: 'failed', error: '지시문을 정리하지 못했어요. 다시 해 주세요' })

        generate.mockReset().mockResolvedValue({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })
        const db2 = fakeDb({ ...job({ status: 'check', fidelity: null }) })
        await runDeepJob(db2 as never, 'j1')
        expect(db2.row).toMatchObject({ status: 'done', fidelity: null })
    })

    it('다른 실행이 막 잡은 단계는 건드리지 않는다', async () => {
        const db = fakeDb({ ...job({ status: 'write', result: null, claimed_at: new Date().toISOString() }) })
        await runDeepJob(db as never, 'j1')
        expect(generate).not.toHaveBeenCalled()
        expect(db.row.status).toBe('write')
    })

    it('남은 시간이 모자라면 시작하지 않는다 (다음 폴링이 잇는다)', async () => {
        const db = fakeDb({ ...job({ status: 'research', research: null, result: null }) })
        await runDeepJob(db as never, 'j1', { deadline: Date.now() + 10_000 })
        expect(generate).not.toHaveBeenCalled()
        expect(db.row.claimed_at).toBeNull()
    })
})
