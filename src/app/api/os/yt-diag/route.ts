// 임시 진단 (0928): 운영 서버에서 유튜브 Gemini 정리를 짧은 공개 영상 하나로 한 번만 확인한다. 확인 뒤 지운다.
// 영상은 코드에 박은 하나뿐이고, 한 번 정리되면 표에 저장돼 다시 불러도 돈이 들지 않는다. 1분에 3번까지.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getYoutubeDigest, readYoutube, geminiYoutubeConfig } from '@/domains/os/readers'
import { supabaseDigestStore } from '@/domains/os/readers/youtube-gemini'
import type { DigestStore } from '@/domains/os/readers/youtube-gemini'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const VIDEO_ID = 'GCa_GNMKJ6g' // YTN 자막뉴스 2:23 (공개)
const hits: number[] = []

export async function GET() {
    const now = Date.now()
    while (hits.length && now - hits[0] > 60_000) hits.shift()
    if (hits.length >= 3) return NextResponse.json({ error: 'slow down' }, { status: 429 })
    hits.push(now)

    const db = createAdminClient()
    const base = supabaseDigestStore(db)
    const store: DigestStore = {
        ...base,
        countToday: (_u, since) => base.countToday('00000000-0000-0000-0000-000000000000', since),
        start: async ({ videoId, model }) => {
            const { data } = await db.from('youtube_digest_calls').insert({ video_id: videoId, user_id: null, model, status: 'started' }).select('id').single()
            return (data?.id as string) ?? null
        },
    }
    const cfg = geminiYoutubeConfig()
    const t0 = Date.now()
    const outcome = await getYoutubeDigest({ videoId: VIDEO_ID, userId: 'diag', title: 'diag', channel: 'YTN', store })
    const digestMs = Date.now() - t0
    const t1 = Date.now()
    const read = await readYoutube(`https://www.youtube.com/watch?v=${VIDEO_ID}`, { gemini: { userId: null, waitMs: 5_000 }, maxChars: 12_000 })
    const readMs = Date.now() - t1
    const { data: calls } = await db.from('youtube_digest_calls').select('*').eq('video_id', VIDEO_ID).order('created_at', { ascending: false }).limit(3)
    return NextResponse.json({
        config: { ...cfg, enabled: cfg.enabled },
        outcome: outcome.ok ? { ok: true, from: outcome.from, model: outcome.model, chars: outcome.text.length } : outcome,
        digestMs,
        read: read.ok ? { method: read.method, title: read.title, chars: read.text.length, text: read.text } : read,
        readMs,
        calls,
    })
}
