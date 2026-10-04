// 임시 진단 창구 (대표 지시 1005: 인스타그램, 스레드 읽기 점검). 진단이 끝나면 지운다.
// 열쇠(해시 비교)가 맞을 때만 열린다. 공개 페이지를 고정된 주소로만 읽는다.
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readInstagram } from '@/domains/os/readers/instagram'
import { readThreads } from '@/domains/os/readers/threads'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HASH = 'd34a2728942504e65e7f83aca54a7ae48f34279da4c9878255f784777593eef0'
const UAS: Record<string, string> = {
    chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
    fb: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    google: 'Googlebot/2.1 (+http://www.google.com/bot.html)',
    bing: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
}
const URLS = [
    'https://www.instagram.com/nasa/', 'https://www.instagram.com/natgeo/', 'https://www.instagram.com/instagram/',
    'https://www.instagram.com/nasa/embed/',
    'https://www.instagram.com/p/DeCNJEyOkpq/', 'https://www.instagram.com/p/DeCNJEyOkpq/embed/captioned/',
    'https://www.threads.com/@nasa', 'https://www.threads.com/@zuck', 'https://www.threads.com/@natgeo',
    'https://www.threads.com/@nasa/post/Dd6o9h3ERXF',
]

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({})) as { key?: string }
    if (createHash('sha256').update(String(b.key ?? '')).digest('hex') !== HASH) return NextResponse.json({ error: 'no' }, { status: 404 })
    const rows = await Promise.all(URLS.flatMap(url => Object.entries(UAS).map(async ([ua, agent]) => {
        const t0 = Date.now()
        try {
            const r = await fetch(url, { headers: { 'User-Agent': agent, 'Accept-Language': 'ko-KR,ko;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) })
            const h = await r.text()
            return {
                url, ua, status: r.status, final: r.url.slice(0, 80), bytes: h.length, ms: Date.now() - t0,
                title: (h.match(/<title[^>]*>([^<]{0,80})/)?.[1] ?? ''),
                ogd: (h.match(/og:description" content="([^"]{0,100})/)?.[1] ?? ''),
                captions: (h.match(/"caption":\{/g) ?? []).length + (h.match(/\\"text\\":/g) ?? []).length,
                texts: (h.match(/"text":"/g) ?? []).length,
                login: /login_required|accounts\/login|checkpoint/i.test(h.slice(0, 20_000)),
            }
        } catch (e) { return { url, ua, error: String(e).slice(0, 80), ms: Date.now() - t0 } }
    })))
    const old = await Promise.all([
        readInstagram('https://www.instagram.com/nasa/'), readInstagram('https://www.instagram.com/p/DeCNJEyOkpq/'),
        readThreads('https://www.threads.com/@nasa'), readThreads('https://www.threads.com/@nasa/post/Dd6o9h3ERXF'),
    ])
    const ip = await fetch('https://api64.ipify.org?format=json').then(r => r.text()).catch(() => '')
    return NextResponse.json({ ip, region: process.env.VERCEL_REGION, rows, old: old.map(o => o.ok ? { ok: true, n: o.posts.length } : o) })
}
