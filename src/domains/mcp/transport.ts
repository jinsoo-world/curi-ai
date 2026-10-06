// domains/mcp — MCP 서버에 POST 한 번 보내는 껍데기 (Streamable HTTP 의 바깥 통로)
//
// fetch 대신 node:https 를 쓰는 이유 = 이름 풀이(lookup)를 우리 손에 쥐려고.
// safeLookup 이 번호를 풀자마자 사설 대역인지 보고, 그 번호로만 붙는다(DNS 되돌리기 막기).
// 튕기기(3xx)는 따라가지 않는다. MCP 서버는 한 주소에서 답해야 한다.
// 몸통은 MAX_RESPONSE_BYTES 넘으면 끊는다.

import { request } from 'https'
import { isBlockedMcpHost, safeLookup } from './url'
import { MAX_RESPONSE_BYTES, TOOL_TIMEOUT_MS } from './limits'

export interface HttpResult {
    status: number
    headers: Record<string, string>
    body: string
}

export interface HttpPostOptions {
    timeoutMs?: number
    maxBytes?: number
}

export type HttpPost = (url: string, headers: Record<string, string>, body: string, opts?: HttpPostOptions) => Promise<HttpResult>

export class McpTransportError extends Error {
    code: 'blocked' | 'timeout' | 'too_large' | 'network' | 'redirect'
    constructor(code: McpTransportError['code'], message: string) {
        super(message)
        this.name = 'McpTransportError'
        this.code = code
    }
}

export const httpsPost: HttpPost = (url, headers, body, opts = {}) => {
    const timeoutMs = opts.timeoutMs ?? TOOL_TIMEOUT_MS
    const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES
    return new Promise<HttpResult>((resolve, reject) => {
        let settled = false
        const done = (fn: () => void) => { if (!settled) { settled = true; clearTimeout(timer); fn() } }
        const u = new URL(url)
        if (u.protocol !== 'https:') return reject(new McpTransportError('blocked', 'https 주소만 쓸 수 있어요'))
        // 붙기 직전에 이름으로 한 번 더 본다(저장 뒤 규칙이 바뀌어도, 번호 주소는 이름 풀이를 안 거쳐도 막히게). 풀린 번호는 safeLookup 이 본다
        if (isBlockedMcpHost(u.hostname)) {
            return reject(new McpTransportError('blocked', '쓸 수 없는 주소예요(내부망·로컬 주소는 막혀 있어요)'))
        }

        const req = request({
            protocol: 'https:',
            hostname: u.hostname.replace(/^\[|\]$/g, ''),
            port: u.port || 443,
            path: `${u.pathname}${u.search}`,
            method: 'POST',
            headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
            lookup: safeLookup as never,
        }, res => {
            const status = res.statusCode ?? 0
            if (status >= 300 && status < 400) {
                res.resume()
                return done(() => reject(new McpTransportError('redirect', '서버가 다른 주소로 보냈어요. 최종 주소를 넣어 주세요')))
            }
            const declared = Number(res.headers['content-length'] ?? 0)
            if (declared > maxBytes) {
                res.destroy()
                return done(() => reject(new McpTransportError('too_large', '서버 응답이 너무 커요')))
            }
            const chunks: Buffer[] = []
            let total = 0
            res.on('data', (c: Buffer) => {
                total += c.length
                if (total > maxBytes) {
                    res.destroy()
                    req.destroy()
                    return done(() => reject(new McpTransportError('too_large', '서버 응답이 너무 커요')))
                }
                chunks.push(c)
            })
            res.on('end', () => done(() => {
                const flat: Record<string, string> = {}
                for (const [k, v] of Object.entries(res.headers)) {
                    if (v !== undefined) flat[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v)
                }
                resolve({ status, headers: flat, body: Buffer.concat(chunks).toString('utf8') })
            }))
            res.on('error', () => done(() => reject(new McpTransportError('network', '서버 응답을 읽다가 끊겼어요'))))
        })
        const timer = setTimeout(() => {
            req.destroy()
            done(() => reject(new McpTransportError('timeout', '서버가 너무 느려요(시간 초과)')))
        }, timeoutMs)
        req.on('error', (e: NodeJS.ErrnoException) => done(() => {
            if (e.code === 'EBLOCKED') reject(new McpTransportError('blocked', '쓸 수 없는 주소예요(내부망·로컬 주소는 막혀 있어요)'))
            else reject(new McpTransportError('network', '서버에 붙지 못했어요'))
        }))
        req.end(body)
    })
}
