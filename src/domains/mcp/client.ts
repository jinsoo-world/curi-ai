// domains/mcp — MCP 클라이언트 (Streamable HTTP, JSON-RPC 2.0)
//
// 공식 SDK(@modelcontextprotocol/sdk)를 깔지 않고 필요한 4가지만 직접 한다.
//   initialize → notifications/initialized → tools/list → tools/call
// 이유 = SDK 의 fetch 는 이름 풀이를 우리가 못 잡아 SSRF(DNS 되돌리기)를 막기 어렵다. transport.ts 가 그 일을 한다.
// 서버 답은 JSON 한 덩어리이거나 SSE(event-stream) 둘 다 받는다(규격 2025-06-18 Streamable HTTP).
// 🔐 인증 값은 머리글에만 싣는다. 오류 글에 섞여 나오면 지운다(redact).

import { httpsPost, type HttpPost } from './transport'
import { MAX_TOOL_DESCRIPTION_CHARS, MAX_TOOL_DESCRIPTIONS_TOTAL_CHARS, MAX_TOOL_SCHEMA_CHARS, MAX_TOOLS_PER_SERVER, NOTIFY_TIMEOUT_MS, TOOL_TIMEOUT_MS } from './limits'

export const MCP_PROTOCOL_VERSION = '2025-06-18'
const CLIENT_INFO = { name: 'curi-ai', version: '1.0.0' }

export interface McpTool {
    name: string
    description: string
    /** 서버가 annotations.readOnlyHint=true(그리고 destructiveHint≠true)로 밝힌 도구만 true. 모르면 쓰기 도구로 본다 */
    readOnly: boolean
    inputSchema: Record<string, unknown>
}

export interface McpAuth {
    headerName: string
    value: string
}

export class McpError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'McpError'
    }
}

type JsonRpcMessage = { jsonrpc?: string; id?: number | string | null; result?: unknown; error?: { code?: number; message?: string }; method?: string }

/** 오류 글에서 인증 값을 지운다 (서버가 받은 머리글을 그대로 되돌려 보내는 경우까지) */
export function redact(text: string, secret: string | null | undefined): string {
    let out = String(text ?? '')
    if (!secret) return out
    const parts = [secret, ...secret.split(/\s+/).filter(p => p.length >= 6)]
    for (const p of parts) out = out.split(p).join('••••')
    return out
}

/** SSE 몸통에서 data 줄들을 JSON 으로 모은다 */
export function parseSse(body: string): JsonRpcMessage[] {
    const out: JsonRpcMessage[] = []
    for (const block of String(body ?? '').split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n')
        if (!data) continue
        try {
            const parsed = JSON.parse(data)
            if (Array.isArray(parsed)) out.push(...parsed)
            else out.push(parsed)
        } catch { /* JSON 이 아닌 이벤트는 건너뛴다 */ }
    }
    return out
}

/** 서버 답에서 내 요청 번호(id)에 맞는 응답 하나를 찾는다 */
export function pickResponse(contentType: string, body: string, id: number): JsonRpcMessage | null {
    let messages: JsonRpcMessage[] = []
    if (contentType.includes('text/event-stream')) messages = parseSse(body)
    else {
        try {
            const parsed = JSON.parse(body)
            messages = Array.isArray(parsed) ? parsed : [parsed]
        } catch { return null }
    }
    return messages.find(m => m && (m.id === id || m.id === String(id)) && ('result' in m || 'error' in m)) ?? null
}

/**
 * 서버가 준 도구 목록을 우리가 쓸 모양으로 다듬는다
 * (개수·설명·설명 글자 합·스키마 크기 제한, 읽기 전용 표시, 설명 속 인증 값 가리기)
 */
export function cleanTools(raw: unknown, secret?: string | null): McpTool[] {
    const list = Array.isArray(raw) ? raw : []
    const out: McpTool[] = []
    let descTotal = 0
    for (const t of list) {
        if (!t || typeof t !== 'object') continue
        const name = String((t as { name?: unknown }).name ?? '').trim()
        if (!name || name.length > 128) continue
        const description = redact(String((t as { description?: unknown }).description ?? ''), secret).slice(0, MAX_TOOL_DESCRIPTION_CHARS)
        if (descTotal + description.length > MAX_TOOL_DESCRIPTIONS_TOTAL_CHARS) break
        descTotal += description.length
        let schema = (t as { inputSchema?: unknown }).inputSchema
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) schema = { type: 'object', properties: {} }
        if (JSON.stringify(schema).length > MAX_TOOL_SCHEMA_CHARS) schema = { type: 'object', properties: {} }
        const ann = ((t as { annotations?: unknown }).annotations ?? {}) as { readOnlyHint?: unknown; destructiveHint?: unknown }
        const readOnly = ann.readOnlyHint === true && ann.destructiveHint !== true
        out.push({ name, description, readOnly, inputSchema: schema as Record<string, unknown> })
        if (out.length >= MAX_TOOLS_PER_SERVER) break
    }
    return out
}

/** 도구 결과(content 배열)를 글로 바꾼다. 글이 아닌 것(사진 등)은 표시만 */
export function toolResultToText(result: unknown): { text: string; isError: boolean } {
    const r = (result ?? {}) as { content?: unknown; isError?: unknown; structuredContent?: unknown }
    const parts: string[] = []
    if (Array.isArray(r.content)) {
        for (const c of r.content) {
            const item = c as { type?: string; text?: unknown; resource?: { text?: unknown; uri?: unknown } }
            if (item?.type === 'text') parts.push(String(item.text ?? ''))
            else if (item?.type === 'resource' && item.resource?.text) parts.push(String(item.resource.text))
            else if (item?.type) parts.push(`[${item.type}]`)
        }
    }
    if (!parts.length && r.structuredContent) parts.push(JSON.stringify(r.structuredContent))
    return { text: parts.join('\n').trim(), isError: r.isError === true }
}

export class McpSession {
    private sessionId: string | null = null
    private protocolVersion = MCP_PROTOCOL_VERSION
    private nextId = 1
    private initialized = false

    constructor(
        private readonly url: string,
        private readonly auth: McpAuth | null = null,
        private readonly post: HttpPost = httpsPost,
        private readonly timeoutMs: number = TOOL_TIMEOUT_MS,
        private readonly now: () => number = Date.now,
    ) {}

    /** 이번 요청에 줄 시간 = min(상한, 마감까지 남은 시간). 남은 시간이 없으면 보내지 않는다 */
    private budget(cap: number, deadline?: number): number {
        if (deadline === undefined) return cap
        const left = deadline - this.now()
        if (left <= 0) this.fail('시간이 모자라 서버에 묻지 못했어요')
        return Math.min(cap, left)
    }

    private headers(): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'User-Agent': 'CuriAI-MCP/1.0',
        }
        if (this.initialized) h['MCP-Protocol-Version'] = this.protocolVersion
        if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId
        if (this.auth) h[this.auth.headerName] = this.auth.value
        return h
    }

    private fail(message: string): never {
        throw new McpError(redact(message, this.auth?.value))
    }

    private async send(method: string, params: Record<string, unknown>, deadline?: number): Promise<unknown> {
        const timeoutMs = this.budget(this.timeoutMs, deadline)
        const id = this.nextId++
        let res
        try {
            res = await this.post(this.url, this.headers(), JSON.stringify({ jsonrpc: '2.0', id, method, params }), { timeoutMs })
        } catch (e) {
            this.fail(e instanceof Error ? e.message : '서버에 붙지 못했어요')
        }
        if (res.status === 401 || res.status === 403) this.fail('서버가 인증을 거절했어요(인증 값을 확인해 주세요)')
        if (res.status === 404 && this.sessionId) this.fail('서버 연결이 끊겼어요(다시 시도해 주세요)')
        if (res.status < 200 || res.status >= 300) this.fail(`서버 응답 ${res.status}`)
        const sid = res.headers['mcp-session-id']
        if (sid && /^[\x21-\x7e]{1,256}$/.test(sid)) this.sessionId = sid
        const msg = pickResponse(res.headers['content-type'] ?? '', res.body, id)
        if (!msg) this.fail('서버 답 모양이 MCP 가 아니에요')
        if (msg.error) this.fail(`서버 오류: ${String(msg.error.message ?? '').slice(0, 200)}`)
        return msg.result
    }

    private async notify(method: string, deadline?: number): Promise<void> {
        try {
            const timeoutMs = this.budget(NOTIFY_TIMEOUT_MS, deadline)
            await this.post(this.url, this.headers(), JSON.stringify({ jsonrpc: '2.0', method }), { timeoutMs })
        } catch { /* 알림은 실패해도 이어 간다 */ }
    }

    /** deadline = 이 시각(밀리초, now() 기준)까지 끝내야 한다. 안 주면 요청마다 timeoutMs */
    async initialize(deadline?: number): Promise<{ serverName: string }> {
        const result = await this.send('initialize', {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: CLIENT_INFO,
        }, deadline) as { protocolVersion?: unknown; serverInfo?: { name?: unknown } } | undefined
        if (typeof result?.protocolVersion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.protocolVersion)) {
            this.protocolVersion = result.protocolVersion
        }
        this.initialized = true
        await this.notify('notifications/initialized', deadline)
        return { serverName: String(result?.serverInfo?.name ?? '').slice(0, 80) }
    }

    async listTools(deadline?: number): Promise<McpTool[]> {
        if (!this.initialized) await this.initialize(deadline)
        const result = await this.send('tools/list', {}, deadline) as { tools?: unknown } | undefined
        return cleanTools(result?.tools, this.auth?.value)
    }

    async callTool(name: string, args: Record<string, unknown>, deadline?: number): Promise<{ text: string; isError: boolean }> {
        if (!this.initialized) await this.initialize(deadline)
        const result = await this.send('tools/call', { name, arguments: args }, deadline)
        const out = toolResultToText(result)
        return { text: redact(out.text, this.auth?.value), isError: out.isError }
    }
}
