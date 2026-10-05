// 임시 진단 창구 (대표 지시 1005: 인스타그램 학습 품질). 측정이 끝나면 지운다.
// 열쇠(해시 비교)가 맞을 때만 열린다.
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import { addLinkSource } from '@/domains/os/knowledge'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HASH = '84da56f8a9cb0607b07346f060155a3f9339a4882e35209a0dbb5f2bb2fd0c28'

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({})) as { key?: string; urls?: string[]; mentorId?: string }
    if (createHash('sha256').update(String(b.key ?? '')).digest('hex') !== HASH) return NextResponse.json({ error: 'no' }, { status: 404 })
    const rows = []
    for (const url of (b.urls ?? []).slice(0, 6)) {
        if (!/^https:\/\/www\.instagram\.com\//.test(url)) continue
        const t0 = Date.now()
        const r = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: 15_000 })
        if (!r.ok) { rows.push({ url, ok: false, reason: r.reason, code: r.code, ms: Date.now() - t0 }); continue }
        const posts = r.social?.posts ?? []
        const row: Record<string, unknown> = {
            url, ok: true, ms: Date.now() - t0, chars: r.text.length, posts: posts.length,
            profile: r.social?.profile,
            captionChars: posts.map(p => p.text.length),
            withDate: posts.filter(p => p.postedAt).length, withLikes: posts.filter(p => p.likes !== undefined).length,
            withComments: posts.filter(p => p.comments !== undefined).length, withTags: posts.filter(p => p.hashtags.length).length,
            images: posts.reduce((n, p) => n + p.imageUrls.length, 0), reels: posts.filter(p => p.isReel).length,
            sample: r.text.slice(0, 420),
        }
        if (b.mentorId) {
            const db = createAdminClient()
            try {
                const saved = await addLinkSource(db, b.mentorId, url) as { id?: string; deduped?: boolean }
                const { count } = await db.from('knowledge_social_posts').select('id', { count: 'exact', head: true }).eq('source_id', saved.id ?? '')
                row.ingest = { id: saved.id, deduped: saved.deduped ?? false, socialRows: count }
            } catch (e) { row.ingest = { error: e instanceof Error ? e.message.slice(0, 160) : 'err' } }
        }
        rows.push(row)
    }
    return NextResponse.json({ region: process.env.VERCEL_REGION, rows })
}
