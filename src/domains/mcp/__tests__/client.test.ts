// MCP 클라이언트 — Streamable HTTP(JSON·SSE 둘 다), 세션 번호, 인증 값 비노출
import { describe, it, expect } from 'vitest'
import { McpSession, McpError, parseSse, cleanTools, redact } from '../client'
import type { HttpPost, HttpResult } from '../transport'

const SECRET = 'Bearer sk-live-SUPERSECRET-123456'

type Call = { headers: Record<string, string>; body: Record<string, unknown> }
function fakeServer(handler: (msg: Record<string, unknown>, call: Call) => HttpResult) {
    const calls: Call[] = []
    const post: HttpPost = async (_url, headers, body) => {
        const call = { headers, body: JSON.parse(body) }
        calls.push(call)
        return handler(call.body, call)
    }
    return { post, calls }
}
const json = (obj: unknown, extra: Record<string, string> = {}): HttpResult => ({ status: 200, headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify(obj) })
const sse = (obj: unknown): HttpResult => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress' })}\n\nevent: message\ndata: ${JSON.stringify(obj)}\n\n` })

describe('McpSession', () => {
    it('initialize → initialized 알림 → tools/list, 세션 번호와 규격 판을 이어 붙인다', async () => {
        const { post, calls } = fakeServer(msg => {
            if (msg.method === 'initialize') return json({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: '시험서버' } } }, { 'mcp-session-id': 'sess-1' })
            if (msg.method === 'notifications/initialized') return { status: 202, headers: {}, body: '' }
            if (msg.method === 'tools/list') return sse({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'search', description: '찾기', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }] } })
            throw new Error('unexpected')
        })
        const s = new McpSession('https://mcp.example.com/mcp', { headerName: 'Authorization', value: SECRET }, post)
        const init = await s.initialize()
        expect(init.serverName).toBe('시험서버')
        const tools = await s.listTools()
        expect(tools).toEqual([{ name: 'search', description: '찾기', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }])
        expect(calls.map(c => c.body.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list'])
        expect(calls[0].headers.Accept).toContain('text/event-stream')
        expect(calls[0].headers['Mcp-Session-Id']).toBeUndefined()
        expect(calls[2].headers['Mcp-Session-Id']).toBe('sess-1')
        expect(calls[2].headers['MCP-Protocol-Version']).toBe('2025-06-18')
        expect(calls[2].headers.Authorization).toBe(SECRET)   // 인증 값은 머리글로만
        expect(JSON.stringify(calls.map(c => c.body))).not.toContain('SUPERSECRET')
    })

    it('tools/call 결과의 text 만 모은다', async () => {
        const { post } = fakeServer(msg => {
            if (msg.method === 'initialize') return json({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2025-06-18' } })
            if (msg.method === 'tools/call') return json({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: '결과1' }, { type: 'image', data: 'x' }], isError: false } })
            return { status: 202, headers: {}, body: '' }
        })
        const s = new McpSession('https://mcp.example.com/mcp', null, post)
        expect(await s.callTool('search', { q: 'a' })).toEqual({ text: '결과1\n[image]', isError: false })
    })

    it('401 이면 인증 안내, 오류 글에 인증 값이 섞여 오면 지운다', async () => {
        const deny = fakeServer(() => ({ status: 401, headers: {}, body: SECRET }))
        const s1 = new McpSession('https://mcp.example.com/mcp', { headerName: 'Authorization', value: SECRET }, deny.post)
        await expect(s1.initialize()).rejects.toThrow(/인증/)

        const echo = fakeServer(msg => json({ jsonrpc: '2.0', id: msg.id, error: { code: -1, message: `bad token ${SECRET}` } }))
        const s2 = new McpSession('https://mcp.example.com/mcp', { headerName: 'Authorization', value: SECRET }, echo.post)
        const err = await s2.initialize().catch(e => e)
        expect(err).toBeInstanceOf(McpError)
        expect(String(err.message)).not.toContain('SUPERSECRET')
    })

    it('도구 결과에 인증 값이 섞여 와도 지운다', async () => {
        const { post } = fakeServer(msg => {
            if (msg.method === 'initialize') return json({ jsonrpc: '2.0', id: msg.id, result: {} })
            if (msg.method === 'tools/call') return json({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: `your key is ${SECRET}` }] } })
            return { status: 202, headers: {}, body: '' }
        })
        const s = new McpSession('https://mcp.example.com/mcp', { headerName: 'Authorization', value: SECRET }, post)
        expect((await s.callTool('x', {})).text).not.toContain('SUPERSECRET')
    })

    it('MCP 가 아닌 답이면 오류', async () => {
        const { post } = fakeServer(() => ({ status: 200, headers: { 'content-type': 'text/html' }, body: '<html>' }))
        await expect(new McpSession('https://mcp.example.com/mcp', null, post).initialize()).rejects.toThrow(/MCP/)
    })
})

describe('도움 함수', () => {
    it('parseSse 는 여러 이벤트의 data 를 모은다', () => {
        expect(parseSse('data: {"id":1}\n\ndata: not json\n\ndata: {"id":2}\n\n')).toEqual([{ id: 1 }, { id: 2 }])
    })
    it('cleanTools 는 개수·설명·스키마 크기를 자른다', () => {
        const many = Array.from({ length: 40 }, (_, i) => ({ name: `t${i}`, description: 'x'.repeat(2000), inputSchema: { type: 'object', big: 'y'.repeat(10_000) } }))
        const out = cleanTools(many)
        expect(out).toHaveLength(20)
        expect(out[0].description).toHaveLength(500)
        expect(out[0].inputSchema).toEqual({ type: 'object', properties: {} })
        expect(cleanTools([{ description: '이름 없음' }, null])).toEqual([])
    })
    it('redact 는 전체 값과 토큰 부분을 모두 가린다', () => {
        expect(redact(`a ${SECRET} b sk-live-SUPERSECRET-123456`, SECRET)).not.toContain('SUPERSECRET')
    })
})
