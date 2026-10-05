// 임시 점검 창구 (대표 지시 1005 13:12 큐리어스 링크 읽기 실서버 확인). 확인이 끝나면 바로 지운다.
// 열쇠(해시 비교)가 맞을 때만 열린다. 읽기만 한다(DB 저장 없음).
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readUrl, KNOWLEDGE_READ_OPTIONS, CHAT_READ_OPTIONS } from '@/domains/os/readers'
import { classifySnsLink } from '@/domains/os/sns-link'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HASH = 'a74bf18c09821ad67f283d7b6622004df2eb5ecb5734386d3150e36c424eec45'

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({})) as { key?: string; urls?: string[]; full?: boolean }
    if (createHash('sha256').update(String(b.key ?? '')).digest('hex') !== HASH) return NextResponse.json({ error: 'no' }, { status: 404 })
    const urls = (b.urls ?? []).slice(0, 6).map(String)
    const rows = await Promise.all(urls.map(async url => {
        const t0 = Date.now()
        let platform = ''
        try { platform = classifySnsLink(url).platform } catch { platform = 'bad' }
        const chat = await readUrl(url, { ...CHAT_READ_OPTIONS })
        const chatMs = Date.now() - t0
        const t1 = Date.now()
        const r = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: 25_000 })
        return {
            url, platform, chat: chat.ok ? { chars: chat.text.length, source: chat.source, ms: chatMs } : { reason: chat.reason, code: chat.code },
            ok: r.ok, ms: Date.now() - t1,
            ...(r.ok ? { title: r.title, chars: r.text.length, method: r.method, source: r.source, image: r.image ?? null, images: r.images?.length ?? 0, text: b.full ? r.text : r.text.slice(0, 600) } : { reason: r.reason, code: r.code }),
        }
    }))
    return NextResponse.json({ region: process.env.VERCEL_REGION, rows })
}
