// 시험용 가짜 Supabase — 표를 메모리에 두고 우리가 쓰는 만큼만 흉내 낸다.
// (select/insert/update/upsert/delete + eq/neq/lt/gt/in/order/limit/maybeSingle/single + count head)
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

export interface FakeDb {
    db: SupabaseClient
    tables: Tables
    calls: { table: string; op: string; filters: [string, string, unknown][] }[]
    removedFiles: string[]
}

export function makeFakeDb(initial: Tables, opts: { missingTables?: string[] } = {}): FakeDb {
    const tables: Tables = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v.map(r => ({ ...r }))]))
    const calls: FakeDb['calls'] = []
    const removedFiles: string[] = []
    let seq = 0

    function builder(table: string) {
        let op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
        let conflictCols: string[] = []
        let payload: Row | null = null
        let countMode = false
        let head = false
        let single: 'maybe' | 'one' | null = null
        let limitN = Infinity
        const filters: [string, string, unknown][] = []

        const match = (r: Row) => filters.every(([kind, c, v]) => {
            if (kind === 'eq') return r[c] === v
            if (kind === 'neq') return r[c] !== v
            if (kind === 'in') return (v as unknown[]).includes(r[c])
            if (kind === 'contains') return Array.isArray(r[c]) && (v as unknown[]).every(x => (r[c] as unknown[]).includes(x))
            if (r[c] === null || r[c] === undefined) return false
            return kind === 'lt' ? String(r[c]) < String(v) : String(r[c]) > String(v)
        })

        const run = async () => {
            calls.push({ table, op, filters: [...filters] })
            if (opts.missingTables?.includes(table)) return { data: null, error: { code: '42P01', message: 'relation does not exist' }, count: null }
            const rows = (tables[table] ??= [])
            if (op === 'insert') {
                const row = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...payload }
                rows.push(row)
                return { data: single ? row : [row], error: null }
            }
            if (op === 'upsert') {
                const hit = rows.find(r => conflictCols.every(c => r[c] === (payload as Row)[c]))
                if (hit) { Object.assign(hit, payload); return { data: single ? hit : [hit], error: null } }
                const row = { id: `id-${++seq}`, created_at: new Date().toISOString(), ...payload }
                rows.push(row)
                return { data: single ? row : [row], error: null }
            }
            if (op === 'update') {
                const hit = rows.filter(match)
                for (const r of hit) Object.assign(r, payload)
                return { data: hit, error: null }
            }
            if (op === 'delete') {
                const keep = rows.filter(r => !match(r))
                const goneRows = rows.filter(match)
                tables[table] = keep
                // DELETE ... RETURNING 흉내 (select 를 붙였을 때 지운 줄을 돌려준다)
                return { data: single ? goneRows[0] ?? null : goneRows, error: null, count: goneRows.length }
            }
            const hit = rows.filter(match).slice(0, limitN)
            if (countMode && head) return { data: null, error: null, count: hit.length }
            if (single === 'maybe') return { data: hit[0] ?? null, error: null }
            if (single === 'one') return hit[0] ? { data: hit[0], error: null } : { data: null, error: { message: 'no rows' } }
            return { data: hit, error: null, count: countMode ? hit.length : null }
        }

        const b: Record<string, unknown> = {
            select: (_cols?: string, o?: { count?: string; head?: boolean }) => { if (o?.count) countMode = true; if (o?.head) head = true; return b },
            insert: (p: Row) => { op = 'insert'; payload = p; return b },
            update: (p: Row) => { op = 'update'; payload = p; return b },
            upsert: (p: Row, o?: { onConflict?: string }) => { op = 'upsert'; payload = p; conflictCols = (o?.onConflict ?? 'id').split(',').map(x => x.trim()); return b },
            delete: () => { op = 'delete'; return b },
            eq: (c: string, v: unknown) => { filters.push(['eq', c, v]); return b },
            neq: (c: string, v: unknown) => { filters.push(['neq', c, v]); return b },
            lt: (c: string, v: unknown) => { filters.push(['lt', c, v]); return b },
            gt: (c: string, v: unknown) => { filters.push(['gt', c, v]); return b },
            in: (c: string, v: unknown[]) => { filters.push(['in', c, v]); return b },
            contains: (c: string, v: unknown[]) => { filters.push(['contains', c, v]); return b },
            order: () => b,
            limit: (n: number) => { limitN = n; return b },
            maybeSingle: () => { single = 'maybe'; return run() },
            single: () => { single = 'one'; return run() },
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
        }
        return b
    }

    const db = {
        from: (t: string) => builder(t),
        storage: { from: () => ({ remove: async (paths: string[]) => { removedFiles.push(...paths); return { data: null, error: null } } }) },
    }
    return { db: db as unknown as SupabaseClient, tables, calls, removedFiles }
}
