// 시험용 아주 작은 Supabase 흉내. 표 여러 개, 모든 질의의 eq/in 조건과 limit 을 기록한다
type Row = Record<string, unknown>

export function fakeDb(seed: Record<string, Row[]> = {}) {
    const tables: Record<string, Row[]> = { mcp_servers: [], mentors: [], creator_profiles: [], ...seed }
    const rows = tables.mcp_servers
    const queries: { table: string; op: string; filters: Record<string, unknown>; limit?: number }[] = []
    let seq = 0

    function builder(table: string, op: 'select' | 'insert' | 'update' | 'delete', payload?: Row, opts?: { count?: string; head?: boolean }) {
        const filters: Record<string, unknown> = {}
        const ins: Record<string, unknown[]> = {}
        const entry: { table: string; op: string; filters: Record<string, unknown>; limit?: number } = { table, op, filters }
        queries.push(entry)
        const list = tables[table] ?? (tables[table] = [])
        const match = () => list.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v) && Object.entries(ins).every(([k, vs]) => vs.includes(r[k])))
        const run = (): { data: unknown; error: null; count?: number } => {
            if (op === 'insert') {
                const now = new Date().toISOString()
                const row = { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, created_at: now, updated_at: now, tool_count: null, last_error: null, last_checked_at: null, ...payload }
                list.push(row)
                return { data: [row], error: null }
            }
            let hit = match()
            if (op === 'update') { hit.forEach(r => Object.assign(r, payload)); return { data: hit, error: null, count: hit.length } }
            if (op === 'delete') { hit.forEach(r => list.splice(list.indexOf(r), 1)); return { data: null, error: null, count: hit.length } }
            const count = hit.length
            if (entry.limit !== undefined) hit = hit.slice(0, entry.limit)
            return { data: opts?.head ? null : hit, error: null, count }
        }
        const q: Record<string, unknown> = {
            select: () => q,
            eq: (k: string, v: unknown) => { filters[k] = v; return q },
            in: (k: string, vs: unknown[]) => { ins[k] = vs; return q },
            order: () => q,
            limit: (n: number) => { entry.limit = n; return q },
            single: async () => { const r = run(); return { data: (r.data as Row[])[0] ?? null, error: null } },
            maybeSingle: async () => { const r = run(); return { data: (r.data as Row[] | null)?.[0] ?? null, error: null } },
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
        }
        return q
    }

    const db = {
        from: (table: string) => ({
            select: (_cols?: string, opts?: { count?: string; head?: boolean }) => builder(table, 'select', undefined, opts),
            insert: (row: Row) => builder(table, 'insert', row),
            update: (patch: Row) => builder(table, 'update', patch),
            delete: () => builder(table, 'delete'),
        }),
    }
    return { db: db as never, rows, tables, queries }
}

/** 봇 주인 자료: owner 사용자가 만든 봇들 */
export function ownedBots(userId: string, botIds: string[]): Record<string, Row[]> {
    return {
        creator_profiles: [{ id: `cp-${userId}`, user_id: userId }],
        mentors: botIds.map(id => ({ id, creator_id: `cp-${userId}` })),
    }
}
