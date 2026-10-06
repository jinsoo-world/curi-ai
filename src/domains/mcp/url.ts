// domains/mcp — MCP 서버 주소 검사 (SSRF 막기)
//
//  1. https 만. 아이디·비번이 박힌 주소(https://a@b) 거절.
//  2. 이름만 보고 막기 = localhost, *.local, *.internal, 우리 Supabase·배포, 번호 주소의 사설 대역
//     (agent/fetch-url.ts 의 isBlockedHost·isPrivateIp 를 그대로 쓴다. 규칙은 한 곳).
//  3. 실제로 붙을 때는 transport.ts 가 이름을 번호로 풀자마자 사설 대역인지 다시 보고, 그 번호로만 붙는다
//     (검사한 번호와 붙는 번호가 같다 = DNS 되돌리기 공격이 안 먹는다).

import { lookup as dnsLookup } from 'dns'
import { isBlockedHost, isPrivateIp } from '@/domains/agent/fetch-url'

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: string }

const MAX_URL_LENGTH = 2_000

/** 저장 전에 하는 주소 검사 (이름만 보고) */
export function checkMcpUrl(raw: unknown): UrlCheck {
    const text = String(raw ?? '').trim()
    if (!text) return { ok: false, reason: '서버 주소가 비어 있어요' }
    if (text.length > MAX_URL_LENGTH) return { ok: false, reason: '서버 주소가 너무 길어요' }
    let u: URL
    try { u = new URL(text) } catch { return { ok: false, reason: '서버 주소 모양이 아니에요' } }
    if (u.protocol !== 'https:') return { ok: false, reason: 'https 주소만 쓸 수 있어요' }
    if (u.username || u.password) return { ok: false, reason: '주소에 아이디·비밀번호를 넣지 마세요. 인증 값 칸에 따로 넣어 주세요' }
    if (isBlockedHost(u.hostname)) return { ok: false, reason: '쓸 수 없는 주소예요(내부망·로컬 주소는 막혀 있어요)' }
    u.hash = ''
    return { ok: true, url: u.toString() }
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | { address: string; family: number }[], family?: number) => void

/**
 * https.request 의 lookup 자리에 끼우는 안전한 이름 풀이.
 * 풀린 번호 중 하나라도 사설 대역이면 거절한다. 못 풀어도 거절.
 */
export function safeLookup(
    hostname: string,
    options: { all?: boolean; family?: number } | number | undefined,
    callback: LookupCb,
    resolver: typeof dnsLookup = dnsLookup,
): void {
    const opts = typeof options === 'object' && options ? options : {}
    resolver(hostname, { all: true, family: opts.family ?? 0 }, (err, addrs) => {
        if (err) return callback(err, '')
        const list = (addrs as unknown as { address: string; family: number }[]) ?? []
        if (!list.length || list.some(a => isPrivateIp(a.address))) {
            const e = new Error('blocked_private_address') as NodeJS.ErrnoException
            e.code = 'EBLOCKED'
            return callback(e, '')
        }
        if (opts.all) return callback(null, list)
        callback(null, list[0].address, list[0].family)
    })
}

/** 인증 머리글 이름으로 쓸 수 있나. 연결을 흔드는 머리글은 막는다 */
const FORBIDDEN_HEADERS = new Set([
    'host', 'cookie', 'content-length', 'content-type', 'accept', 'connection', 'transfer-encoding',
    'mcp-session-id', 'mcp-protocol-version', 'user-agent', 'te', 'upgrade', 'proxy-authorization',
])
export function checkHeaderName(raw: unknown): string | null {
    const name = String(raw ?? '').trim() || 'Authorization'
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) return null
    if (FORBIDDEN_HEADERS.has(name.toLowerCase())) return null
    return name
}

/** 인증 값 다듬기. Authorization 에 「띄어쓰기 없는 토큰」만 주면 Bearer 를 붙여 준다 */
export function normalizeAuthValue(headerName: string, raw: unknown): string | null {
    const v = String(raw ?? '').trim()
    if (!v) return null
    if (/[\r\n]/.test(v) || v.length > 4_096) throw new Error('인증 값 모양이 이상해요')
    if (headerName.toLowerCase() === 'authorization' && !/\s/.test(v)) return `Bearer ${v}`
    return v
}
