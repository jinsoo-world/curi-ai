// 임시 점검 창구 (대표 지시 1005: 인스타그램, 스레드, 블로그 읽기 실측). 점검이 끝나면 지운다.
// 열쇠(해시 비교)가 맞을 때만 열린다. 읽기는 공개 주소만, 저장은 임시 점검용 봇 한 개에만 한다.
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import { createAdminClient } from '@/lib/supabase/admin'
import { addDraftSources, addLinkSource, loadSlotUsage } from '@/domains/os/knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const HASH = 'd34a2728942504e65e7f83aca54a7ae48f34279da4c9878255f784777593eef0'
const TEST_MENTOR = '64cfe556-333c-4ff0-b176-57b1735bb37f'

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({})) as { key?: string; action?: string; urls?: string[] }
    if (createHash('sha256').update(String(b.key ?? '')).digest('hex') !== HASH) return NextResponse.json({ error: 'no' }, { status: 404 })
    const urls = (b.urls ?? []).slice(0, 12).map(String)
    const ip = await fetch('https://api64.ipify.org?format=json').then(r => r.text()).catch(() => '')
    const region = process.env.VERCEL_REGION
    if (b.action === 'read') {
        const rows = await Promise.all(urls.map(async url => {
            const t0 = Date.now()
            const r = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: 20_000 })
            return r.ok
                ? { url, ok: true, source: r.source, chars: r.text.length, posts: r.text.split(/\n-{3,}\n/).length, head: r.text.slice(0, 90), ms: Date.now() - t0 }
                : { url, ok: false, code: (r as { code?: string }).code, reason: r.reason, ms: Date.now() - t0 }
        }))
        return NextResponse.json({ ip, region, rows })
    }
    const db = createAdminClient()
    if (b.action === 'ingest') {
        const t0 = Date.now()
        const r = await addDraftSources(db, TEST_MENTOR, { links: urls, pastes: [], deadline: Date.now() + 100_000 })
        const slots = await loadSlotUsage(db, TEST_MENTOR)
        return NextResponse.json({ ip, region, result: r, slots: slots.slots, perKey: Object.fromEntries(slots.perKey), ms: Date.now() - t0 })
    }
    if (b.action === 'link') {
        const t0 = Date.now()
        try {
            const s = await addLinkSource(db, TEST_MENTOR, urls[0]) as { id: string; accountCount?: number }
            return NextResponse.json({ ip, region, ok: true, id: s.id, accountCount: s.accountCount, ms: Date.now() - t0 })
        } catch (e) { return NextResponse.json({ ip, region, ok: false, reason: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code, ms: Date.now() - t0 }) }
    }
    return NextResponse.json({ ip, region })
}
