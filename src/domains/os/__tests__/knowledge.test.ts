import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isSafeExternalUrl, isYoutubeUrl, htmlToText, pickTitle, assertBotOwned, BotNotMine, assertRoomForMore, USABLE_SOURCE_FILTER, MAX_SOURCES_PER_BOT, isUnusableSource, retryBotSource } from '../knowledge'

describe('isSafeExternalUrl — 우리 서버가 대신 열어도 되는 주소인가', () => {
    it('평범한 공개 주소는 통과', () => {
        expect(isSafeExternalUrl('https://curious-500.com/post/1')).toBe(true)
        expect(isSafeExternalUrl('http://example.com')).toBe(true)
    })

    it('사내망·내 컴퓨터 주소는 막는다', () => {
        for (const 주소 of [
            'http://localhost:3000/secret',
            'http://127.0.0.1/',
            'http://10.0.0.5/',
            'http://192.168.0.1/',
            'http://172.16.3.4/',
            'http://169.254.169.254/latest/meta-data/',   // 클라우드 열쇠가 나오는 자리
            'http://db.internal/',
        ]) {
            expect(isSafeExternalUrl(주소), 주소).toBe(false)
        }
    })

    it('http·https 가 아닌 것은 막는다', () => {
        expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
        expect(isSafeExternalUrl('ftp://a.com')).toBe(false)
        expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
        expect(isSafeExternalUrl('그냥 글')).toBe(false)
        expect(isSafeExternalUrl('')).toBe(false)
    })
})

describe('isYoutubeUrl', () => {
    it('유튜브 주소를 알아본다', () => {
        expect(isYoutubeUrl('https://www.youtube.com/watch?v=abc')).toBe(true)
        expect(isYoutubeUrl('https://youtu.be/abc')).toBe(true)
        expect(isYoutubeUrl('https://m.youtube.com/watch?v=abc')).toBe(true)
    })
    it('비슷해 보이는 남의 주소는 아니다', () => {
        expect(isYoutubeUrl('https://youtube.com.evil.net/watch')).toBe(false)
        expect(isYoutubeUrl('https://naver.com')).toBe(false)
        expect(isYoutubeUrl('아무 글')).toBe(false)
    })
})

describe('htmlToText / pickTitle', () => {
    it('스크립트·스타일·태그를 걷어내고 글만 남긴다', () => {
        const html = '<html><head><style>b{}</style><script>alert(1)</script></head><body><h1>제목</h1><p>본문 &amp; 내용</p></body></html>'
        const t = htmlToText(html)
        expect(t).toContain('제목')
        expect(t).toContain('본문 & 내용')
        expect(t).not.toContain('alert')
        expect(t).not.toContain('<p>')
    })

    it('제목 태그를 제목으로 쓰고, 없으면 주소를 쓴다', () => {
        expect(pickTitle('<title>큐리어스 글</title>', 'https://a.com')).toBe('큐리어스 글')
        expect(pickTitle('<html>없음</html>', 'https://a.com')).toBe('https://a.com')
    })
})

/** 가짜 Supabase — 어떤 조건이 걸렸는지 본다 */
function makeDb(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
    const eqs: [string, unknown][] = []
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
        from: self, select: self,
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return chain },
        maybeSingle: async () => result,
    })
    return { db: chain as unknown as SupabaseClient, eqs }
}

describe('assertBotOwned — 남의 봇 자료는 서버에서 막힌다', () => {
    it('내 팀 봇이면 통과하고, user_id 와 mentor_id 를 둘 다 건다', async () => {
        const { db, eqs } = makeDb({ data: { id: 'tb1' }, error: null })
        await assertBotOwned(db, 'u1', 'm1')
        expect(eqs).toContainEqual(['user_id', 'u1'])
        expect(eqs).toContainEqual(['mentor_id', 'm1'])
    })

    it('내 팀에 없으면 막는다', async () => {
        const { db } = makeDb({ data: null, error: null })
        await expect(assertBotOwned(db, 'u1', 'm9')).rejects.toBeInstanceOf(BotNotMine)
    })

    it('표가 아직 없어도 열어 주지 않는다 (기본 거절)', async () => {
        const { db } = makeDb({ data: null, error: { code: '42P01', message: 'no table' } })
        await expect(assertBotOwned(db, 'u1', 'm1')).rejects.toBeInstanceOf(BotNotMine)
    })

    it('빈 값이면 막는다', async () => {
        const { db } = makeDb({ data: { id: 'tb1' }, error: null })
        await expect(assertBotOwned(db, '', 'm1')).rejects.toBeInstanceOf(BotNotMine)
        await expect(assertBotOwned(db, 'u1', '')).rejects.toBeInstanceOf(BotNotMine)
    })
})

describe('assertRoomForMore — 쓸 수 있는 자료만 자리를 차지한다', () => {
    type Row = { processing_status: string; chunk_count: number }
    // .or(USABLE_SOURCE_FILTER) 가 걸렸을 때만 실패, 빈 자료를 빼고 센다 (진짜 PostgREST 를 흉내)
    function fakeDb(rows: Row[]) {
        const calls: string[] = []
        const q: any = {
            select: () => q,
            eq: () => q,
            or: (f: string) => { calls.push(f); return q },
            then: (res: (v: unknown) => void) => {
                const usable = calls.includes(USABLE_SOURCE_FILTER)
                    ? rows.filter(r => ['pending', 'processing'].includes(r.processing_status) || (r.processing_status === 'completed' && r.chunk_count > 0))
                    : rows
                res({ count: usable.length, error: null })
            },
        }
        return { db: { from: () => q } as unknown as SupabaseClient, calls }
    }
    const ok = (n: number): Row[] => Array.from({ length: n }, () => ({ processing_status: 'completed', chunk_count: 3 }))

    it('실패한 자료, 조각 0개 자료는 세지 않는다', async () => {
        const { db, calls } = fakeDb([...ok(8), { processing_status: 'failed', chunk_count: 0 }, { processing_status: 'completed', chunk_count: 0 }])
        await expect(assertRoomForMore(db, 'm1')).resolves.toBeUndefined()
        expect(calls).toEqual([USABLE_SOURCE_FILTER])
    })
    it('처리 중인 자료는 센다 (한꺼번에 올려서 한도를 넘지 못하게)', async () => {
        const { db } = fakeDb([...ok(MAX_SOURCES_PER_BOT - 1), { processing_status: 'processing', chunk_count: 0 }])
        await expect(assertRoomForMore(db, 'm1')).rejects.toThrow(`${MAX_SOURCES_PER_BOT}개`)
    })
    it('쓸 수 있는 자료가 10개면 막는다', async () => {
        const { db } = fakeDb(ok(MAX_SOURCES_PER_BOT))
        await expect(assertRoomForMore(db, 'm1')).rejects.toThrow()
    })
})

describe('못 읽은 자료 다시 시도', () => {
    it('실패, 또는 다 끝났는데 조각 0개면 못 읽은 자료', () => {
        expect(isUnusableSource('failed', 0)).toBe(true)
        expect(isUnusableSource('completed', 0)).toBe(true)
        expect(isUnusableSource('completed', 3)).toBe(false)
        expect(isUnusableSource('processing', 0)).toBe(false)
    })

    // 부른 것을 적어 두는 가짜 DB. select 는 row 하나를 돌려준다
    function fakeDb(row: Record<string, unknown> | null) {
        const log: { table: string; op: string; arg?: unknown; eqs: [string, unknown][] }[] = []
        const from = (table: string) => {
            const entry = { table, op: 'select', arg: undefined as unknown, eqs: [] as [string, unknown][] }
            log.push(entry)
            const q: any = {
                select: () => q,
                update: (v: unknown) => { entry.op = 'update'; entry.arg = v; return q },
                delete: () => { entry.op = 'delete'; return q },
                eq: (k: string, v: unknown) => { entry.eqs.push([k, v]); return q },
                maybeSingle: async () => ({ data: row, error: null }),
                then: (res: (v: unknown) => void) => res({ error: null }),
            }
            return q
        }
        return { db: { from } as unknown as SupabaseClient, log }
    }

    it('파일은 조각을 비우고 기다리는 중으로 돌려 다시 읽게 한다 (이유 칸도 비움)', async () => {
        const { db, log } = fakeDb({ id: 's1', title: 'a.pdf', source_type: 'pdf', original_url: 'm1/1-file.pdf', content: null, processing_status: 'failed', chunk_count: 0, source_kind: null })
        await expect(retryBotSource(db, 'm1', 's1')).resolves.toEqual({ mode: 'process', sourceId: 's1' })
        expect(log.find(l => l.table === 'knowledge_chunks')?.op).toBe('delete')
        const up = log.find(l => l.op === 'update')
        expect(up?.arg).toMatchObject({ processing_status: 'pending', chunk_count: 0 })
        expect(up?.eqs).toContainEqual(['mentor_id', 'm1'])
    })
    it('다 읽은 자료는 다시 읽지 않는다', async () => {
        const { db } = fakeDb({ id: 's1', title: 'a', source_type: 'text', original_url: null, content: '글'.repeat(20), processing_status: 'completed', chunk_count: 2, source_kind: null })
        await expect(retryBotSource(db, 'm1', 's1')).rejects.toThrow('이미 다 읽은 자료예요')
    })
    it('남의 봇 자료 번호면 못 찾는다', async () => {
        const { db, log } = fakeDb(null)
        await expect(retryBotSource(db, 'm1', 'x')).rejects.toThrow('그 자료를 못 찾았어요')
        expect(log[0].eqs).toContainEqual(['mentor_id', 'm1'])
    })
    it('원본이 없으면 빼고 다시 넣어 달라고 한다', async () => {
        const { db } = fakeDb({ id: 's1', title: 'a', source_type: 'text', original_url: null, content: null, processing_status: 'failed', chunk_count: 0, source_kind: null })
        await expect(retryBotSource(db, 'm1', 's1')).rejects.toThrow('다시 읽을 원본이 없어요')
    })
})
