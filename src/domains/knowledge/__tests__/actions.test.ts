import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// 진짜 임베딩(Gemini)은 부르지 않는다. splitIntoChunks 는 진짜처럼 문단 단위로 쪼개서
// singleChunk 규칙(쪼개지 않는다)을 진짜로 시험할 수 있게 한다.
vi.mock('../embedding', () => ({
    generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
    splitIntoChunks: (text: string) => text.split(/\n\n+/).map(s => s.trim()).filter(Boolean),
}))

import { addKnowledgeSource } from '../actions'

/** 가짜 Supabase — knowledge_sources / knowledge_chunks 두 표만 흉내 낸다 */
function makeFakeDb(sourceRow: { id: string }) {
    const chunkInserts: Record<string, unknown>[] = []
    const sourceInserts: Record<string, unknown>[] = []
    const db = {
        from(table: string) {
            if (table === 'knowledge_sources') {
                return {
                    insert: (row: Record<string, unknown>) => {
                        sourceInserts.push(row)
                        return { select: () => ({ single: async () => ({ data: sourceRow, error: null }) }) }
                    },
                    update: () => ({ eq: async () => ({ error: null }) }),
                }
            }
            if (table === 'knowledge_chunks') {
                return {
                    insert: (row: Record<string, unknown>) => { chunkInserts.push(row); return Promise.resolve({ error: null }) },
                }
            }
            throw new Error(`예상 못한 표: ${table}`)
        },
    }
    return { db: db as unknown as SupabaseClient, chunkInserts, sourceInserts }
}

describe('addKnowledgeSource — Q&A 청크 하나 규칙', () => {
    it('opts.singleChunk 이면 문단이 여러 개라도 조각은 정확히 하나', async () => {
        const { db, chunkInserts } = makeFakeDb({ id: 's1' })
        const content = '질문: 이거 뭐예요\n답: 첫 문단\n\n둘째 문단\n\n셋째 문단'
        await addKnowledgeSource(db, 'm1', '제목', content, 'text', undefined, { singleChunk: true })
        expect(chunkInserts).toHaveLength(1)
        expect(chunkInserts[0].content).toBe(content)
        expect(chunkInserts[0].chunk_index).toBe(0)
    })

    it('singleChunk 을 안 주면 기존처럼 문단 단위로 쪼갠다', async () => {
        const { db, chunkInserts } = makeFakeDb({ id: 's2' })
        const content = '첫 문단\n\n둘째 문단\n\n셋째 문단'
        await addKnowledgeSource(db, 'm1', '제목', content, 'text')
        expect(chunkInserts).toHaveLength(3)
    })

    it('메타를 같이 저장한다', async () => {
        const { db, sourceInserts } = makeFakeDb({ id: 's3' })
        await addKnowledgeSource(db, 'm1', '질문', '질문: 뭐\n답: 답', 'text', undefined, {
            singleChunk: true,
            meta: { context: '자주 묻는 것', authorIsMe: true, sourceKind: 'qa' },
        })
        expect(sourceInserts[0]).toMatchObject({ context: '자주 묻는 것', author_is_me: true, source_kind: 'qa' })
    })

    it('메타 칸이 없는 표(마이그레이션 전)에도 메타 없이 한 번 더 저장해 자료는 들어간다', async () => {
        const sourceRow = { id: 's4' }
        const chunkInserts: Record<string, unknown>[] = []
        let calls = 0
        const db = {
            from(table: string) {
                if (table === 'knowledge_sources') {
                    return {
                        insert: (row: Record<string, unknown>) => ({
                            select: () => ({
                                single: async () => {
                                    calls += 1
                                    if (calls === 1) return { data: null, error: { code: '42703', message: 'column "context" does not exist' } }
                                    expect(row.context).toBeUndefined()   // 두 번째 시도엔 메타가 빠져 있어야 한다
                                    return { data: sourceRow, error: null }
                                },
                            }),
                        }),
                        update: () => ({ eq: async () => ({ error: null }) }),
                    }
                }
                if (table === 'knowledge_chunks') {
                    return { insert: (row: Record<string, unknown>) => { chunkInserts.push(row); return Promise.resolve({ error: null }) } }
                }
                throw new Error(table)
            },
        }
        const source = await addKnowledgeSource(db as unknown as SupabaseClient, 'm1', '질문', '질문: 뭐\n답: 답', 'text', undefined, {
            singleChunk: true, meta: { context: '설명', sourceKind: 'qa' },
        })
        expect(source).toEqual(sourceRow)
        expect(chunkInserts).toHaveLength(1)
        expect(calls).toBe(2)
    })
})
