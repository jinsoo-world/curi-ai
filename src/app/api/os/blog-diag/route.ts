// 임시 점검 창구 (대표 승인 1005 11:27 블로그 확장 실서버 읽기 확인). 확인이 끝나면 바로 지운다.
// 열쇠(해시 비교)가 맞을 때만 열린다. 읽기만 한다(DB 저장 없음).
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import { classifySnsLink, refineSnsTarget } from '@/domains/os/sns-link'
import { FETCHERS } from '@/domains/os/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HASH = '7dbf876abd5e5142f7b3a71d925c29f3d8ddba73086e8733464ed52ff1bdf636'

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({})) as { key?: string; urls?: string[] }
    if (createHash('sha256').update(String(b.key ?? '')).digest('hex') !== HASH) return NextResponse.json({ error: 'no' }, { status: 404 })
    const urls = (b.urls ?? []).slice(0, 6).map(String)
    const ip = await fetch('https://api64.ipify.org?format=json').then(r => r.text()).catch(() => '')
    const rows = await Promise.all(urls.map(async url => {
        const t0 = Date.now()
        try {
            const t = await refineSnsTarget(classifySnsLink(url))
            const base = { url, platform: t.platform, single: !!t.single, paste: !!t.paste, feed: t.feed ? t.feed.kind + ' ' + t.feed.handleOrUrl : null }
            if (t.single) {
                const r = await readUrl(t.url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: 25_000, single: true })
                return { ...base, ok: r.ok, ms: Date.now() - t0, ...(r.ok ? { title: r.title.slice(0, 50), chars: r.text.length, method: r.method } : { reason: r.reason, code: r.code }) }
            }
            if (t.feed) {
                const feed = { id: 'diag', mentorId: 'diag', userId: 'diag', kind: t.feed.kind, handleOrUrl: t.feed.handleOrUrl, status: 'connected' as const, lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '' }
                const r = await FETCHERS[t.feed.kind](feed, null, { maxItems: 30, deadline: Date.now() + 40_000 })
                return { ...base, ok: r.items.length > 0, ms: Date.now() - t0, items: r.items.length, chars: r.items.reduce((n, i) => n + (i.text ?? '').length, 0), first: r.items[0] ? { title: r.items[0].title.slice(0, 40), url: r.items[0].url, chars: (r.items[0].text ?? '').length } : null, note: r.note }
            }
            return { ...base, ok: false, ms: Date.now() - t0, reason: '읽지 않는 곳' }
        } catch (e) {
            return { url, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }
        }
    }))
    return NextResponse.json({ ip, region: process.env.VERCEL_REGION, rows })
}
