// /api/chat 입구 — 서버 없으면 아무것도 안 함, 도구 결과는 울타리 글로
import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'crypto'
import { runMcpForChat } from '../chat'
import { fakeDb, ownedBots } from './fake-db'

beforeAll(() => { process.env.CONNECTOR_SECRET_KEY = randomBytes(32).toString('base64') })

describe('runMcpForChat', () => {
    it('이 봇에 쓸 서버가 없으면 모델도 서버도 안 부른다', async () => {
        const { db } = fakeDb()
        let called = false
        const r = await runMcpForChat({ db, userId: 'u1', botId: 'b1', history: [{ role: 'user', content: '안녕' }], modelStep: async () => { called = true; return { content: '', toolCalls: [], usage: null } } })
        expect(r).toEqual({ hadServers: false, material: '', sources: [], phase: null })
        expect(called).toBe(false)
    })

    it('도구 모델이 없으면(솔라 열쇠 없음) 건너뛰되 저장 답은 막는다', async () => {
        const { db, rows } = fakeDb(ownedBots('u1', ['b1']))
        rows.push({ id: 's1', user_id: 'u1', name: 'a', url: 'https://a.example.com/mcp', auth_header_name: 'Authorization', auth_encrypted: null, auth_hint: null, enabled: true, bot_ids: null, status: 'unknown', created_at: '', updated_at: '' })
        const before = process.env.UPSTAGE_API_KEY
        delete process.env.UPSTAGE_API_KEY
        try {
            const r = await runMcpForChat({ db, userId: 'u1', botId: 'b1', history: [] })
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
        const r = await runMcpForChat({ db, userId: 'u1', botId: 'b9', history: [], modelStep: async () => { called = true; return { content: '', toolCalls: [], usage: null } } })
        expect(r.hadServers).toBe(false)
        expect(called).toBe(false)
    })
})
