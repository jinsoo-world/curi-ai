// MCP 서버 저장 — 인증 값 잠금·비노출, 본인 행만, 요금제 한도, 봇 고르기
import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'crypto'
import { createMcpServer, deleteMcpServer, listMcpServers, McpInputError, McpLimitReached, McpNotMine, readMcpServerForUse, serversForBot, updateMcpServer } from '../store'
import { mcpServerLimit, MCP_SERVER_LIMITS } from '../limits'
import { fakeDb } from './fake-db'

const SECRET = 'sk-live-SUPERSECRET-987654'
const BOT_A = '11111111-1111-4111-8111-111111111111'
const BOT_B = '22222222-2222-4222-8222-222222222222'

beforeAll(() => { process.env.CONNECTOR_SECRET_KEY = randomBytes(32).toString('base64') })

describe('요금제 한도', () => {
    it('기본값 무료 1·베이직 3·프로 10', () => {
        expect(MCP_SERVER_LIMITS).toEqual({ free: 1, basic: 3, pro: 10 })
        expect(mcpServerLimit('basic')).toBe(3)
    })
    it('한도를 넘으면 McpLimitReached', async () => {
        const { db } = fakeDb()
        await createMcpServer(db, 'u1', { name: '하나', url: 'https://a.example.com/mcp' }, 1)
        await expect(createMcpServer(db, 'u1', { name: '둘', url: 'https://b.example.com/mcp' }, 1)).rejects.toBeInstanceOf(McpLimitReached)
        // 다른 사람 개수는 내 한도에 안 들어간다
        await expect(createMcpServer(db, 'u2', { name: '남', url: 'https://c.example.com/mcp' }, 1)).resolves.toBeTruthy()
    })
})

describe('저장과 비노출', () => {
    it('인증 값은 잠가서 넣고, 밖으로 나가는 모양에는 원문도 암호문도 없다', async () => {
        const { db, rows } = fakeDb()
        const view = await createMcpServer(db, 'u1', { name: '내 서버', url: 'https://mcp.example.com/mcp', authValue: SECRET }, 3)
        expect(rows[0].auth_encrypted).toMatch(/^v1\./)
        expect(JSON.stringify(rows[0])).not.toContain('SUPERSECRET')
        expect(view).toMatchObject({ name: '내 서버', hasAuth: true, authHint: '••••7654', authHeaderName: 'Authorization', enabled: true, botIds: null, status: 'unknown' })
        const listed = await listMcpServers(db, 'u1')
        for (const out of [view, ...listed]) {
            const s = JSON.stringify(out)
            expect(s).not.toContain('SUPERSECRET')
            expect(s).not.toContain('auth_encrypted')
            expect(s).not.toContain(String(rows[0].auth_encrypted))
        }
        // 실제로 쓸 때만 풀린다 (Bearer 가 붙어서)
        const use = await readMcpServerForUse(db, 'u1', view.id)
        expect(use.auth).toEqual({ headerName: 'Authorization', value: `Bearer ${SECRET}` })
    })

    it('나쁜 주소·이름·봇 번호는 저장 전에 거절', async () => {
        const { db, rows } = fakeDb()
        await expect(createMcpServer(db, 'u1', { name: 'x', url: 'https://127.0.0.1/mcp' }, 3)).rejects.toBeInstanceOf(McpInputError)
        await expect(createMcpServer(db, 'u1', { name: 'x', url: 'http://a.example.com' }, 3)).rejects.toBeInstanceOf(McpInputError)
        await expect(createMcpServer(db, 'u1', { name: '', url: 'https://a.example.com' }, 3)).rejects.toBeInstanceOf(McpInputError)
        await expect(createMcpServer(db, 'u1', { name: 'x', url: 'https://a.example.com', botIds: ['nope'] }, 3)).rejects.toBeInstanceOf(McpInputError)
        await expect(createMcpServer(db, 'u1', { name: 'x', url: 'https://a.example.com', authHeaderName: 'Cookie', authValue: 'a' }, 3)).rejects.toBeInstanceOf(McpInputError)
        expect(rows).toHaveLength(0)
    })
})

describe('본인 행만', () => {
    it('모든 질의에 user_id 가 걸린다', async () => {
        const { db, queries } = fakeDb()
        const v = await createMcpServer(db, 'u1', { name: 'a', url: 'https://a.example.com/mcp' }, 3)
        await listMcpServers(db, 'u1')
        await updateMcpServer(db, 'u1', v.id, { enabled: false })
        await serversForBot(db, 'u1', BOT_A)
        await deleteMcpServer(db, 'u1', v.id)
        for (const q of queries.filter(q => q.op !== 'insert')) expect(q.filters.user_id, q.op).toBe('u1')
    })

    it('남의 서버는 고치기·지우기·읽기가 안 된다', async () => {
        const { db, rows } = fakeDb()
        const v = await createMcpServer(db, 'owner', { name: 'a', url: 'https://a.example.com/mcp', authValue: SECRET }, 3)
        await expect(updateMcpServer(db, 'intruder', v.id, { name: '탈취' })).rejects.toBeInstanceOf(McpNotMine)
        await expect(deleteMcpServer(db, 'intruder', v.id)).rejects.toBeInstanceOf(McpNotMine)
        await expect(readMcpServerForUse(db, 'intruder', v.id)).rejects.toBeInstanceOf(McpNotMine)
        expect(await listMcpServers(db, 'intruder')).toEqual([])
        expect(rows[0].name).toBe('a')
    })
})

describe('고치기·봇 고르기', () => {
    it('주소를 바꾸면 상태가 「모름」으로, 인증 값 null 은 지우기', async () => {
        const { db } = fakeDb()
        const v = await createMcpServer(db, 'u1', { name: 'a', url: 'https://a.example.com/mcp', authValue: SECRET }, 3)
        const u = await updateMcpServer(db, 'u1', v.id, { url: 'https://b.example.com/mcp', authValue: null })
        expect(u).toMatchObject({ url: 'https://b.example.com/mcp', hasAuth: false, authHint: null, status: 'unknown' })
        await expect(updateMcpServer(db, 'u1', v.id, { url: 'https://10.0.0.1/' })).rejects.toBeInstanceOf(McpInputError)
    })

    it('봇 목록이 있으면 그 봇 대화에서만, 꺼진 서버는 안 쓴다', async () => {
        const { db } = fakeDb()
        await createMcpServer(db, 'u1', { name: '전체', url: 'https://a.example.com/mcp' }, 10)
        await createMcpServer(db, 'u1', { name: 'A만', url: 'https://b.example.com/mcp', botIds: [BOT_A] }, 10)
        await createMcpServer(db, 'u1', { name: '꺼짐', url: 'https://c.example.com/mcp', enabled: false }, 10)
        expect((await serversForBot(db, 'u1', BOT_A)).map(s => s.view.name)).toEqual(['전체', 'A만'])
        expect((await serversForBot(db, 'u1', BOT_B)).map(s => s.view.name)).toEqual(['전체'])
        expect(await serversForBot(db, 'u2', BOT_A)).toEqual([])
    })
})
