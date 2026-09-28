import { describe, it, expect } from 'vitest'
import { readMonthlyFilePages, isMissingTable } from '../doc-parse'

type Row = Record<string, unknown>
/** 아주 작은 가짜 supabase: select/eq/neq/gte/in/not 만 */
function fakeDb(tables: Record<string, Row[] | 'missing'>) {
    const from = (t: string) => {
        const conds: ((r: Row) => boolean)[] = []
        const q = {
            select: () => q,
            eq: (c: string, v: unknown) => (conds.push(r => r[c] === v), q),
            neq: (c: string, v: unknown) => (conds.push(r => r[c] !== v), q),
            gte: (c: string, v: string) => (conds.push(r => String(r[c]) >= v), q),
            in: (c: string, v: unknown[]) => (conds.push(r => v.includes(r[c])), q),
            not: (c: string) => (conds.push(r => r[c] != null), q),
            maybeSingle: async () => ({ data: (tables[t] as Row[] ?? []).find(r => conds.every(f => f(r))) ?? null, error: null }),
            then: (res: (v: unknown) => void) => {
                const rows = tables[t]
                if (rows === 'missing') return res({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.doc_page_usage' in the schema cache" } })
                res({ data: (rows ?? []).filter(r => conds.every(f => f(r))), error: null })
            },
        }
        return q
    }
    return { from } as never
}

const now = new Date('2026-09-29T03:00:00Z')
const thisMonth = '2026-09-20T00:00:00.000Z'

describe('월 자료 한도 기록장', () => {
    it('자료를 지워도(knowledge_sources 에 없어도) 기록장 쪽 수는 그대로 센다', async () => {
        const db = fakeDb({
            doc_page_usage: [{ source_id: 's1', user_id: 'u1', pages: 8, created_at: thisMonth }],
            knowledge_sources: [],   // 지워짐
        })
        expect(await readMonthlyFilePages(db, 'u1', { now })).toBe(8)
    })
    it('다른 사람 기록과 지난달 기록은 안 센다, 다시 읽는 자료는 뺀다', async () => {
        const db = fakeDb({ doc_page_usage: [
            { source_id: 's1', user_id: 'u1', pages: 8, created_at: thisMonth },
            { source_id: 's2', user_id: 'u1', pages: 3, created_at: thisMonth },
            { source_id: 's3', user_id: 'u2', pages: 50, created_at: thisMonth },
            { source_id: 's4', user_id: 'u1', pages: 50, created_at: '2026-08-10T00:00:00.000Z' },
        ] })
        expect(await readMonthlyFilePages(db, 'u1', { now })).toBe(11)
        expect(await readMonthlyFilePages(db, 'u1', { now, exceptSourceId: 's2' })).toBe(8)
    })
    it('기록장 표가 아직 없으면 예전 방식(남은 자료 합)으로 센다', async () => {
        const db = fakeDb({
            doc_page_usage: 'missing',
            creator_profiles: [{ id: 'c1', user_id: 'u1' }],
            mentors: [{ id: 'm1', creator_id: 'c1' }],
            team_bots: [],
            knowledge_sources: [{ id: 's1', mentor_id: 'm1', page_count: 4, processing_status: 'completed', created_at: thisMonth }],
        })
        expect(await readMonthlyFilePages(db, 'u1', { now })).toBe(4)
    })
    it('표 없음 오류만 예전 방식으로 넘긴다', () => {
        expect(isMissingTable({ code: '42P01' })).toBe(true)
        expect(isMissingTable({ code: '23505', message: 'duplicate' })).toBe(false)
    })
})
