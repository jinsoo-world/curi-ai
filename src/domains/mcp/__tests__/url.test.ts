// MCP 서버 주소 검사 (SSRF) — 저장 때 이름 검사 + 붙을 때 이름 풀이 검사 + 붙기 직전 검사
import { describe, it, expect } from 'vitest'
import { checkMcpUrl, safeLookup, checkHeaderName, normalizeAuthValue } from '../url'
import { httpsPost, McpTransportError } from '../transport'

describe('checkMcpUrl', () => {
    it('공개 https 주소는 받는다', () => {
        expect(checkMcpUrl('https://mcp.example.com/mcp')).toEqual({ ok: true, url: 'https://mcp.example.com/mcp' })
    })
    it.each([
        ['http://mcp.example.com/mcp', 'https'],
        ['ftp://mcp.example.com', 'https'],
        ['https://user:pw@mcp.example.com', '아이디'],
        ['https://localhost/mcp', '내부망'],
        ['https://api.localhost/mcp', '내부망'],
        ['https://127.0.0.1/mcp', '내부망'],
        ['https://10.1.2.3/mcp', '내부망'],
        ['https://192.168.0.10/mcp', '내부망'],
        ['https://172.20.0.1/mcp', '내부망'],
        ['https://169.254.169.254/latest/meta-data', '내부망'],
        ['https://[::1]/mcp', '내부망'],
        ['https://[::ffff:7f00:1]/mcp', '내부망'],
        ['https://metadata.google.internal/', '내부망'],
        ['https://printer.local/', '내부망'],
        ['', '비어'],
        ['아무말', '모양'],
    ])('%s 는 막는다', (url, why) => {
        const r = checkMcpUrl(url)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toContain(why)
    })
})

type Addr = { address: string; family: number }
const fakeResolver = (addrs: Addr[] | Error) => ((_h: string, _o: unknown, cb: (e: Error | null, a: Addr[]) => void) => {
    if (addrs instanceof Error) cb(addrs, [])
    else cb(null, addrs)
}) as never

function lookupWith(addrs: Addr[] | Error, all = false): Promise<{ err: NodeJS.ErrnoException | null; addr: unknown }> {
    return new Promise(resolve => safeLookup('mcp.example.com', { all }, (err, addr) => resolve({ err, addr }), fakeResolver(addrs)))
}

describe('safeLookup (이름을 번호로 푼 뒤 검사 = DNS 되돌리기 막기)', () => {
    it('공개 번호면 그 번호를 준다', async () => {
        const r = await lookupWith([{ address: '93.184.216.34', family: 4 }])
        expect(r.err).toBeNull()
        expect(r.addr).toBe('93.184.216.34')
    })
    it('사설 번호로 풀리면 막는다', async () => {
        for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
            const r = await lookupWith([{ address: ip, family: ip.includes(':') ? 6 : 4 }])
            expect(r.err?.code, ip).toBe('EBLOCKED')
        }
    })
    it('공개·사설이 섞여 있으면 막는다', async () => {
        const r = await lookupWith([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }], true)
        expect(r.err?.code).toBe('EBLOCKED')
    })
    it('못 풀면 막는다(오류를 그대로 넘긴다)', async () => {
        const r = await lookupWith(new Error('ENOTFOUND'))
        expect(r.err).toBeTruthy()
    })
})

describe('httpsPost 붙기 직전 검사', () => {
    it.each(['https://127.0.0.1/mcp', 'https://[::1]/mcp', 'https://169.254.169.254/', 'https://localhost/mcp', 'http://example.com/'])('%s 는 네트워크에 나가기 전에 막힌다', async url => {
        await expect(httpsPost(url, {}, '{}')).rejects.toBeInstanceOf(McpTransportError)
        await expect(httpsPost(url, {}, '{}')).rejects.toMatchObject({ code: 'blocked' })
    })
})

describe('인증 머리글', () => {
    it('이름 기본값은 Authorization, 위험한 머리글은 거절', () => {
        expect(checkHeaderName(undefined)).toBe('Authorization')
        expect(checkHeaderName('X-API-Key')).toBe('X-API-Key')
        expect(checkHeaderName('Host')).toBeNull()
        expect(checkHeaderName('Cookie')).toBeNull()
        expect(checkHeaderName('Mcp-Session-Id')).toBeNull()
        expect(checkHeaderName('X Bad')).toBeNull()
    })
    it('Authorization 에 토큰만 주면 Bearer 를 붙이고, 줄바꿈은 거절', () => {
        expect(normalizeAuthValue('Authorization', 'abc123')).toBe('Bearer abc123')
        expect(normalizeAuthValue('Authorization', 'Basic abc')).toBe('Basic abc')
        expect(normalizeAuthValue('X-API-Key', 'abc123')).toBe('abc123')
        expect(normalizeAuthValue('Authorization', '  ')).toBeNull()
        expect(() => normalizeAuthValue('Authorization', 'a\r\nHost: evil')).toThrow()
    })
})
