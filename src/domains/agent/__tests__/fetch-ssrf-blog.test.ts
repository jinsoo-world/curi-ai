// 블로그 확장에서 쓰는 가져오기 길의 SSRF 방어 (사설 주소로의 튕김, 이름 풀이, 크기, 시간)
import { describe, it, expect, vi, afterEach } from 'vitest'

const lookup = vi.fn()
vi.mock('dns/promises', () => ({ lookup: (...a: unknown[]) => lookup(...a) }))
const { fetchPageSafely, MAX_REDIRECTS } = await import('../fetch-url')

afterEach(() => { vi.unstubAllGlobals(); lookup.mockReset() })

describe('fetchPageSafely', () => {
    it('공개 주소가 사설 주소(메타데이터)로 튕기면 따라가지 않는다', async () => {
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
        const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }))
        vi.stubGlobal('fetch', fetchMock)
        const r = await fetchPageSafely('https://blog.example.com/feed')
        expect(r.ok).toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    it('이름이 사설 번호로 풀리면 열지 않는다 (DNS 되돌리기), 못 풀어도 열지 않는다', async () => {
        const fetchMock = vi.fn(async () => new Response('x'))
        vi.stubGlobal('fetch', fetchMock)
        lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
        expect((await fetchPageSafely('https://evil.example.com/wp-json/wp/v2/posts')).ok).toBe(false)
        lookup.mockResolvedValue([{ address: '::ffff:7f00:1', family: 6 }])
        expect((await fetchPageSafely('https://evil2.example.com/')).ok).toBe(false)
        lookup.mockRejectedValue(new Error('ENOTFOUND'))
        expect((await fetchPageSafely('https://nowhere.example.com/')).ok).toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })
    it('튕김은 정해진 횟수까지만', async () => {
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
        const fetchMock = vi.fn(async () => new Response(null, { status: 301, headers: { location: 'https://blog.example.com/next' } }))
        vi.stubGlobal('fetch', fetchMock)
        const r = await fetchPageSafely('https://blog.example.com/a')
        expect(r.ok).toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(MAX_REDIRECTS + 1)
    })
    it('미리 알려준 크기가 한도를 넘으면 받지 않고, 몸통은 한도까지만 읽는다', async () => {
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
        vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(50 * 1024 * 1024) } })))
        expect((await fetchPageSafely('https://blog.example.com/wp-json/wp/v2/posts', { maxBytes: 5 * 1024 * 1024 })).ok).toBe(false)
        vi.stubGlobal('fetch', vi.fn(async () => new Response('a'.repeat(10_000), { status: 200, headers: { 'content-type': 'text/html' } })))
        const r = await fetchPageSafely('https://blog.example.com/', { maxBytes: 1_000 })
        expect(r.ok && r.body.length).toBeLessThanOrEqual(1_000)
    })
    it('사설 주소는 부르지도 않는다 (IPv4 를 품은 IPv6 포함)', async () => {
        const fetchMock = vi.fn(async () => new Response('x'))
        vi.stubGlobal('fetch', fetchMock)
        for (const u of ['http://127.0.0.1/', 'http://[::ffff:7f00:1]/', 'http://169.254.169.254/', 'http://localhost:3000/', 'http://[::1]/']) {
            expect((await fetchPageSafely(u)).ok, u).toBe(false)
        }
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
