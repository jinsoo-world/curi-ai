// addKnowledgeSource 보강 (1003): 원문 보관 칸, 같은 글 두 번 저장 막기, 조각 메타, 칸 없는 표에서도 안 깨짐. 임베딩·DB 는 가짜.
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('../embedding', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../embedding')>()),
    generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}))

import { addKnowledgeSource } from '../actions'
import { contentHash } from '../ingest'

type Err = { code: string; message: string } | null
interface FakeOpts {
    /** 같은 해시로 찾았을 때 돌려줄 줄 */
    existing?: { id: string; processing_status: string; chunk_count: number }[]
    /** 원장 insert 가 차례로 낼 오류 */
    sourceErrors?: Err[]
    /** 조각 insert 가 낼 오류 (처음 한 번) */
    chunkError?: Err
}

function fakeDb(o: FakeOpts = {}) {
    const sourceInserts: Record<string, unknown>[] = []
    const chunkInserts: Record<string, unknown>[] = []
    const updates: Record<string, unknown>[] = []
    const lookups: unknown[][] = []
    const sErr = [...(o.sourceErrors ?? [])]
    let chunkErr = o.chunkError ?? null
    const db = {
        from(table: string) {
            if (table === 'knowledge_sources') {
                const q: Record<string, unknown> = {}
                q.select = () => q
                q.eq = (...a: unknown[]) => { lookups.push(a); return q }
                q.limit = async () => ({ data: o.existing ?? [], error: null })
                q.insert = (row: Record<string, unknown>) => ({
                    select: () => ({
                        single: async () => {
                            sourceInserts.push(row)
                            const e = sErr.shift() ?? null
                            return e ? { data: null, error: e } : { data: { id: 'new1' }, error: null }
                        },
                    }),
                })
                q.update = (row: Record<string, unknown>) => { updates.push(row); return { eq: async () => ({ error: null }) } }
                return q
            }
            if (table === 'knowledge_chunks') {
                return {
                    insert: (row: Record<string, unknown>) => {
                        if (chunkErr) { const e = chunkErr; chunkErr = null; return Promise.resolve({ error: e }) }
                        chunkInserts.push(row)
                        return Promise.resolve({ error: null })
                    },
                }
            }
            throw new Error(table)
        },
    }
    return { db: db as unknown as SupabaseClient, sourceInserts, chunkInserts, updates, lookups }
}

const body = '저는 2019년에 퇴사했어요. 첫 강의에서 수강생 37명을 모았어요.'

describe('원문 보관 칸', () => {
    it('해시, 글자 수, 글 날짜, 가져온 시각을 같이 적는다', async () => {
        const { db, sourceInserts } = fakeDb()
        await addKnowledgeSource(db, 'm1', '내 글', body, 'url', 'https://blog.naver.com/me/1', {
            ingest: { publishedAt: '2026-09-01T00:00:00.000Z' },
        })
        expect(sourceInserts[0]).toMatchObject({
            content_hash: contentHash(body), char_count: body.length, published_at: '2026-09-01T00:00:00.000Z',
        })
        expect(typeof sourceInserts[0].fetched_at).toBe('string')
    })

    it('새 칸이 아직 없는 표(마이그레이션 전)면 새 칸만 빼고 기존 메타는 지켜서 다시 저장한다', async () => {
        const { db, sourceInserts, chunkInserts } = fakeDb({
            sourceErrors: [{ code: '42703', message: 'column "content_hash" of relation "knowledge_sources" does not exist' }],
        })
        await addKnowledgeSource(db, 'm1', '내 글', body, 'url', undefined, { meta: { sourceKind: 'blog' } })
        expect(sourceInserts).toHaveLength(2)
        expect(sourceInserts[1].content_hash).toBeUndefined()
        expect(sourceInserts[1].source_kind).toBe('blog')
        expect(chunkInserts.length).toBeGreaterThan(0)
    })
})

describe('같은 글 두 번 저장 막기 (dedupe)', () => {
    it('같은 봇에 같은 글(쓸 수 있는 것)이 있으면 새로 만들지 않고 그 자료를 돌려준다', async () => {
        const { db, sourceInserts, chunkInserts, lookups } = fakeDb({ existing: [{ id: 'old1', processing_status: 'completed', chunk_count: 2 }] })
        const r = await addKnowledgeSource(db, 'm1', '내 글', body, 'url', undefined, { ingest: { dedupe: true } })
        expect(r).toMatchObject({ id: 'old1', deduped: true })
        expect(sourceInserts).toHaveLength(0)
        expect(chunkInserts).toHaveLength(0)
        expect(lookups).toContainEqual(['mentor_id', 'm1'])
        expect(lookups).toContainEqual(['content_hash', contentHash(body)])
    })

    it('같은 글이 있어도 못 읽은 자료(실패, 조각 0)면 새로 넣는다', async () => {
        const { db, sourceInserts } = fakeDb({ existing: [{ id: 'bad', processing_status: 'failed', chunk_count: 0 }] })
        const r = await addKnowledgeSource(db, 'm1', '내 글', body, 'url', undefined, { ingest: { dedupe: true } })
        expect(r).toMatchObject({ id: 'new1' })
        expect(sourceInserts).toHaveLength(1)
    })

    it('dedupe 를 안 주면 찾지 않는다 (다시 시도 흐름은 그대로)', async () => {
        const { db, sourceInserts, lookups } = fakeDb({ existing: [{ id: 'old1', processing_status: 'completed', chunk_count: 2 }] })
        await addKnowledgeSource(db, 'm1', '내 글', body, 'url')
        expect(sourceInserts).toHaveLength(1)
        expect(lookups.some(l => l[0] === 'content_hash')).toBe(false)
    })
})

describe('조각 메타', () => {
    it('조각마다 위치, 제목, 주소, 날짜를 meta 에 적는다', async () => {
        const { db, chunkInserts } = fakeDb()
        await addKnowledgeSource(db, 'm1', '내 영상', `[1:00] ${body}`, 'youtube', 'https://youtu.be/x', { ingest: { publishedAt: '2026-09-01T00:00:00.000Z' } })
        expect(chunkInserts[0].meta).toEqual({ pos: '1/1', t: '1:00', title: '내 영상', url: 'https://youtu.be/x', published_at: '2026-09-01T00:00:00.000Z' })
    })

    it('조각 표에 meta 칸이 없으면 meta 없이 다시 넣는다', async () => {
        const { db, chunkInserts, updates } = fakeDb({ chunkError: { code: '42703', message: 'column "meta" does not exist' } })
        await addKnowledgeSource(db, 'm1', '내 글', body, 'url')
        expect(chunkInserts).toHaveLength(1)
        expect(chunkInserts[0].meta).toBeUndefined()
        expect(updates.at(-1)).toMatchObject({ processing_status: 'completed', chunk_count: 1 })
    })
})
