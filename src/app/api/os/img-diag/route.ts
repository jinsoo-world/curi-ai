// 임시 진단 창구 (대표 승인 1005: 사진 읽기 실서버 측정). 측정이 끝나면 지운다. 열쇠(해시 비교)가 맞을 때만 열린다.
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import { addLinkSource } from '@/domains/os/knowledge'
import { describeImages } from '@/domains/knowledge/image-note'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const HASH = '09faa65c3c202d9b5ab15a10b1dab3f8631d236b9595c8902a5a6af18faefedd'

export async function POST(req: Request) {
    const b = await req.json().catch(() => ({})) as { key?: string; mode?: string; url?: string; mentorId?: string; resolution?: string; n?: number }
    if (createHash('sha256').update(String(b.key ?? '')).digest('hex') !== HASH) return NextResponse.json({ error: 'no' }, { status: 404 })
    const url = String(b.url ?? '')
    if (!/^https:\/\//.test(url)) return NextResponse.json({ error: 'url' }, { status: 400 })
    const t0 = Date.now()
    if (b.mode === 'probe') {
        // 사진만 읽어 보기 (해상도 비교). 저장 안 함
        const r = await readUrl(url, { ...KNOWLEDGE_READ_OPTIONS, timeoutMs: 15_000 })
        if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason })
        const items = r.social ? r.social.posts.slice(0, Math.min(b.n ?? 2, 10)).map((p, i) => ({ key: p.code ?? `i${i}`, url: p.thumbUrl ?? p.imageUrls[0] ?? '' })) : r.image ? [{ key: 'og', url: r.image }] : []
        const notes = await describeImages(items, { route: 'diag/img-probe' }, { budgetMs: 20_000, env: { ...process.env, IMAGE_NOTE_RESOLUTION: b.resolution ?? 'medium' } })
        return NextResponse.json({ ok: true, ms: Date.now() - t0, items: items.length, image: r.image ?? null, notes: [...notes.entries()] })
    }
    if (!b.mentorId) return NextResponse.json({ error: 'mentor' }, { status: 400 })
    const db = createAdminClient()
    try {
        const saved = await addLinkSource(db, b.mentorId, url) as { id?: string; deduped?: boolean }
        const { data } = await db.from('knowledge_sources').select('content').eq('id', saved.id ?? '').maybeSingle()
        const content = String((data as { content?: string } | null)?.content ?? '')
        return NextResponse.json({ ok: true, ms: Date.now() - t0, id: saved.id, notes: (content.match(/사진 설명:/g) ?? []).length, ocr: (content.match(/사진 속 글자:/g) ?? []).length, sample: content.slice(0, 900) })
    } catch (e) { return NextResponse.json({ ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message.slice(0, 200) : 'err' }) }
}
