// GET /api/os/link-diag = 임시 진단 (링크 읽기가 Vercel 서버 IP 에서도 되는지). 확인 후 지운다.
// 🛡 사람이 주소를 넣을 수 없다. 아래 정해 둔 공개 주소만 읽는다(SSRF 표면 없음). 저장하지 않는다. 분당 3번.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { readUrl, cacheClear } from '@/domains/os/readers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const URLS = [
    'https://www.youtube.com/watch?v=A0LQFQphEBg',
    'https://youtu.be/RdmbJa9u9C0',
    'https://n.news.naver.com/mnews/article/001/0016341855',
    'https://blog.naver.com/ahfei_few/224412832410',
    'https://www.yna.co.kr/rss/news.xml',
    'https://github.com/Panniantong/Agent-Reach',
    'https://www.yna.co.kr/view/AKR20260928160000007',
]

const CLIENTS = [
    { name: 'IOS', ver: '20.10.4', hdr: '5', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)', ctx: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', platform: 'MOBILE', osName: 'iOS', osVersion: '18.3.2.22D82' } },
    { name: 'ANDROID_VR', ver: '1.62.20', hdr: '28', ua: 'com.google.android.apps.youtube.vr.oculus/1.62.20 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip', ctx: { deviceMake: 'Oculus', deviceModel: 'Quest 3', platform: 'MOBILE', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 } },
    { name: 'MWEB', ver: '2.20251209.01.00', hdr: '2', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', ctx: { platform: 'MOBILE', osName: 'iOS', osVersion: '17.5.1' } },
    { name: 'WEB', ver: '2.20250925.01.00', hdr: '1', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', ctx: {} },
    { name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', ver: '2.0', hdr: '85', ua: 'Mozilla/5.0 (PlayStation; PlayStation 4/12.00) AppleWebKit/605.1.15 (KHTML, like Gecko)', ctx: {} },
    { name: 'WEB_EMBEDDED_PLAYER', ver: '1.20250923.01.00', hdr: '56', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', ctx: {} },
]

async function probe(videoId: string) {
    const out: Record<string, unknown>[] = []
    for (const c of CLIENTS) {
        const t = Date.now()
        try {
            const res = await fetch('https://youtubei.googleapis.com/youtubei/v1/player?prettyPrint=false', {
                method: 'POST',
                signal: AbortSignal.timeout(6_000),
                headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua, 'X-YouTube-Client-Name': c.hdr, 'X-YouTube-Client-Version': c.ver, Origin: 'https://www.youtube.com' },
                body: JSON.stringify({ context: { client: { clientName: c.name, clientVersion: c.ver, hl: 'ko', gl: 'KR', ...c.ctx } }, videoId, contentCheckOk: true, racyCheckOk: true }),
            })
            const j = res.ok ? await res.json() as { playabilityStatus?: { status?: string; reason?: string }; captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { baseUrl: string; vssId?: string }[] } } } : null
            const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []
            let capLen = -1
            if (tracks[0]) {
                const tr = tracks.find(x => x.vssId?.includes('.ko')) ?? tracks[0]
                const cr = await fetch(tr.baseUrl.replace(/&fmt=[^&]+/, '') + '&fmt=json3', { signal: AbortSignal.timeout(5_000), headers: { 'User-Agent': c.ua } })
                capLen = cr.ok ? (await cr.text()).length : -cr.status
            }
            out.push({ client: c.name, http: res.status, status: j?.playabilityStatus?.status, reason: j?.playabilityStatus?.reason?.slice(0, 80), tracks: tracks.map(x => x.vssId).slice(0, 5), capLen, ms: Date.now() - t })
        } catch (e) {
            out.push({ client: c.name, error: e instanceof Error ? e.message.slice(0, 80) : 'err', ms: Date.now() - t })
        }
    }
    return out
}

const WEB_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

async function probeExtra(videoId: string) {
    const out: Record<string, unknown> = {}
    let t = Date.now()
    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
            method: 'POST', signal: AbortSignal.timeout(6_000),
            headers: { 'Content-Type': 'application/json', 'User-Agent': WEB_UA, Origin: 'https://www.youtube.com' },
            body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'ko', gl: 'KR' } }, videoId }),
        })
        const s = await res.text()
        out.next = { http: res.status, len: s.length, ms: Date.now() - t, hasDesc: s.includes('attributedDescription'), chapters: (s.match(/macroMarkersListItemRenderer/g) ?? []).length, head: s.slice(0, 120) }
    } catch (e) { out.next = { error: e instanceof Error ? e.message : 'err' } }
    t = Date.now()
    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, { signal: AbortSignal.timeout(6_000), headers: { 'User-Agent': WEB_UA, 'Accept-Language': 'ko' } })
        const s = await res.text()
        out.watch = { http: res.status, len: s.length, ms: Date.now() - t, shortDescription: s.includes('shortDescription'), captionTracks: s.includes('captionTracks'), bot: /봇이 아님|not a bot|LOGIN_REQUIRED/.test(s) }
    } catch (e) { out.watch = { error: e instanceof Error ? e.message : 'err' } }
    t = Date.now()
    try {
        const res = await fetch(`https://r.jina.ai/https://www.youtube.com/watch?v=${videoId}`, { signal: AbortSignal.timeout(15_000) })
        const s = await res.text()
        out.jina = { http: res.status, len: s.length, ms: Date.now() - t, chapters: (s.match(/&t=\d+s/g) ?? []).length }
    } catch (e) { out.jina = { error: e instanceof Error ? e.message : 'err', ms: Date.now() - t } }
    return out
}

export async function GET(req: Request) {
    const rl = await checkRateLimit(createAdminClient(), rateLimitKey('link-diag', undefined, undefined, req), 3, 60)
    if (!rl.allowed) return NextResponse.json({ error: 'slow down' }, { status: 429 })
    cacheClear()
    const region = process.env.VERCEL_REGION ?? ''
    const reads = await Promise.all(URLS.map(async u => {
        const t = Date.now()
        const r = await readUrl(u)
        return r.ok
            ? { u, ok: true, ms: Date.now() - t, source: r.source, method: r.method, len: r.text.length, title: r.title, head: r.text.slice(0, 160) }
            : { u, ok: false, ms: Date.now() - t, reason: r.reason }
    }))
    const [youtube, extra] = await Promise.all([probe('A0LQFQphEBg'), probeExtra('A0LQFQphEBg')])
    return NextResponse.json({ region, reads, youtube, extra })
}
