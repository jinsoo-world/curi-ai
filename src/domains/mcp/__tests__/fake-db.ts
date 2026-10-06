// 시험용 아주 작은 Supabase 흉내 (mcp_servers 표 하나). 모든 질의의 eq 조건을 기록한다
type Row = Record<string, unknown>

export function fakeDb() {
    const rows: Row[] = []
    const queries: { op: string; filters: Record<string, unknown> }[] = []
    let seq = 0

    function builder(op: 'select' | 'insert' | 'update' | 'delete', payload?: Row, opts?: { count?: string; head?: boolean }) {
        const filters: Record<string, unknown> = {}
        queries.push({ op, filters })
        const match = () => rows.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v))
        const run = (): { data: unknown; error: null; count?: number } => {
            if (op === 'insert') {
                const now = new Date().toISOString()
                const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: now, updated_at: now, tool_count: null, last_error: null, last_checked_at: null, ...payload }
                rows.push(row)
                return { data: [row], error: null }
            }
            const hit = match()
            if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return { data: hit, error: null, count: hit.length } }
            if (op === 'delete') { hit.forEach(r => rows.splice(rows.indexOf(r), 1)); return { data: null, error: null, count: hit.length } }
            return { data: opts?.head ? null : hit, error: null, count: hit.length }
        }
        const q: Record<string, unknown> = {
            select: () => q,
            eq: (k: string, v: unknown) => { filters[k] = v; return q },
            order: () => q,
            single: async () => { const r = run(); return { data: (r.data as Row[])[0] ?? null, error: null } },
            maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: null } },
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
        }
        return q
    }

    const db = {
        from: (table: string) => {
            if (table !== 'mcp_servers') throw new Error(`unexpected table ${table}`)
            return {
                select: (_cols?: string, opts?: { count?: string; head?: boolean }) => builder('select', undefined, opts),
                insert: (row: Row) => builder('insert', row),
                update: (patch: Row) => builder('update', patch),
                delete: () => builder('delete'),
            }
        },
    }
    return { db: db as never, rows, queries }
}
