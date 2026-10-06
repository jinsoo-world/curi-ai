// /api/chat 입구 — 서버 없으면 아무것도 안 함, 도구 결과는 울타리 글로
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { randomBytes } from 'crypto'
import { runMcpForChat } from '../chat'
import { fakeDb, ownedBots } from './fake-db'

beforeAll(() => { process.env.CONNECTOR_SECRET_KEY = randomBytes(32).toString('base64') })

describe('runMcpForChat', () => {
    it('이 봇에 쓸 서버가 없으면 모델도 서버도 안 부른다', async () => {
        const { db } = fakeDb()
        let called = false
        const r = await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-0', history: [{ role: 'user', content: '안녕' }], modelStep: async () => { called = true; return { content: '', toolCalls: [], usage: null } } })
        expect(r).toEqual({ hadServers: false, material: '', sources: [], phase: null })
        expect(called).toBe(false)
    })

    it('도구 모델이 없으면(솔라 열쇠 없음) 건너뛰되 저장 답은 막는다', async () => {
        const { db, rows } = fakeDb(ownedBots('u1', ['b1']))
        rows.push({ id: 's1', user_id: 'u1', name: 'a', url: 'https://a.example.com/mcp', auth_header_name: 'Authorization', auth_encrypted: null, auth_hint: null, enabled: true, bot_ids: null, status: 'unknown', created_at: '', updated_at: '' })
        const before = process.env.UPSTAGE_API_KEY
        delete process.env.UPSTAGE_API_KEY
        try {
            const r = await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-0', history: [] })
            expect(r).toMatchObject({ hadServers: true, material: '' })
        } finally {
            if (before !== undefined) process.env.UPSTAGE_API_KEY = before
        }
    })
})

describe('내 봇에서만', () => {
    it('내가 만들지 않은 봇(남의 공개 봇) 대화에선 내 MCP 서버도 안 쓴다', async () => {
        const { db, rows } = fakeDb({ creator_profiles: [{ id: 'cp-u1', user_id: 'u1' }], mentors: [{ id: 'b9', creator_id: 'cp-leader' }] })
        rows.push({ id: 's1', user_id: 'u1', name: 'a', url: 'https://a.example.com/mcp', auth_header_name: 'Authorization', auth_encrypted: null, auth_hint: null, enabled: true, bot_ids: null, allowed_tools: [], status: 'unknown', created_at: '', updated_at: '' })
        let called = false
        const r = await runMcpForChat({ db, userId: 'u1', botId: 'b9', sessionId: 'sess-0', history: [], modelStep: async () => { called = true; return { content: '', toolCalls: [], usage: null } } })
        expect(r.hadServers).toBe(false)
        expect(called).toBe(false)
    })
})

describe('세션 오염 표시는 서버 기록 기준 (화면이 보내는 대화 기록을 믿지 않는다)', () => {
    const server = (over: Record<string, unknown> = {}) => ({ id: 's1', user_id: 'u1', name: 'a', url: 'https://a.example.com/mcp', auth_header_name: 'Authorization', auth_encrypted: null, auth_hint: null, enabled: true, bot_ids: null, allowed_tools: ['send_email'], status: 'unknown', created_at: '', updated_at: '', ...over })
    const tools = [
        { name: 'read_inbox', description: '메일 읽기', readOnly: true, inputSchema: { type: 'object', properties: {} } },
        { name: 'send_email', description: '메일 보내기', readOnly: false, inputSchema: { type: 'object', properties: {} } },
    ]
    const fakeConnect = () => {
        const callTool = vi.fn(async () => ({ text: '메일 내용', isError: false }))
        return { connect: () => ({ listTools: async () => tools, callTool }), callTool }
    }

    it('도구 결과를 쓴 대화는 세션에 표시하고, 같은 세션 다음 대화는 쓰기 도구 없이 시작한다', async () => {
        const { db, rows, tables } = fakeDb(ownedBots('u1', ['b1']))
        rows.push(server())
        const { connect } = fakeConnect()
        let round = 0
        const first = await runMcpForChat({
            db, userId: 'u1', botId: 'b1', sessionId: 'sess-1', history: [{ role: 'user', content: '메일 읽어줘' }], connect,
            modelStep: async (_m, ts) => (++round === 1 ? { content: '', toolCalls: [{ id: 'a', name: ts.find(t => t.function.name.endsWith('read_inbox'))!.function.name, arguments: '{}' }], usage: null } : { content: '', toolCalls: [], usage: null }),
        })
        expect(first.phase?.tainted).toBe(true)
        expect(tables.mcp_session_taint).toEqual([expect.objectContaining({ session_id: 'sess-1', user_id: 'u1' })])

        // 다음 대화: 화면이 대화 기록을 비워 보내도 서버 기록으로 오염 상태
        let seen: string[] = []
        await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-1', history: [], connect, modelStep: async (_m, ts) => { seen = ts.map(t => t.function.name); return { content: '', toolCalls: [], usage: null } } })
        expect(seen.some(n => n.endsWith('send_email'))).toBe(false)
        expect(seen.some(n => n.endsWith('read_inbox'))).toBe(true)

        // 다른 세션은 깨끗하게 시작
        await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-2', history: [], connect, modelStep: async (_m, ts) => { seen = ts.map(t => t.function.name); return { content: '', toolCalls: [], usage: null } } })
        expect(seen.some(n => n.endsWith('send_email'))).toBe(true)
    })

    it('도구를 안 쓴 대화는 표시하지 않는다', async () => {
        const { db, rows, tables } = fakeDb(ownedBots('u1', ['b1']))
        rows.push(server())
        await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-1', history: [], connect: fakeConnect().connect, modelStep: async () => ({ content: '', toolCalls: [], usage: null }) })
        expect(tables.mcp_session_taint ?? []).toEqual([])
    })

    it('남의 세션 표시는 내 세션 표시로 안 읽힌다 (user_id 까지 맞아야)', async () => {
        const { db, rows } = fakeDb({ ...ownedBots('u1', ['b1']), mcp_session_taint: [{ session_id: 'sess-1', user_id: 'someone', tainted_at: 'x' }] })
        rows.push(server())
        let seen: string[] = []
        await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-1', history: [], connect: fakeConnect().connect, modelStep: async (_m, ts) => { seen = ts.map(t => t.function.name); return { content: '', toolCalls: [], usage: null } } })
        expect(seen.some(n => n.endsWith('send_email'))).toBe(true)
    })

    it('표시 표를 못 읽으면(표 없음·오류) 오염된 것으로 본다 = 쓰기 도구 숨김', async () => {
        const { db, rows } = fakeDb(ownedBots('u1', ['b1']), { missing: ['mcp_session_taint'] })
        rows.push(server())
        let seen: string[] = []
        await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: 'sess-1', history: [], connect: fakeConnect().connect, modelStep: async (_m, ts) => { seen = ts.map(t => t.function.name); return { content: '', toolCalls: [], usage: null } } })
        expect(seen.some(n => n.endsWith('send_email'))).toBe(false)
    })

    it('세션 번호가 없으면 오염된 것으로 본다', async () => {
        const { db, rows } = fakeDb(ownedBots('u1', ['b1']))
        rows.push(server())
        let seen: string[] = []
        await runMcpForChat({ db, userId: 'u1', botId: 'b1', sessionId: null, history: [], connect: fakeConnect().connect, modelStep: async (_m, ts) => { seen = ts.map(t => t.function.name); return { content: '', toolCalls: [], usage: null } } })
        expect(seen.some(n => n.endsWith('send_email'))).toBe(false)
    })
})
