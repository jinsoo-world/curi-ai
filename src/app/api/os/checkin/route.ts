// GET  /api/os/checkin → 오늘(한국 기준) 체크인이 있나
// POST /api/os/checkin → 오늘 체크인 저장(하루 한 줄, 다시 저장하면 덮어씀)
//
// 저장하면 user_memories 에 한 줄(memory_type='context')을 같이 남긴다 —
// 봇이 「요즘 어떻게 지내는지」를 알아야 다음 한 걸음을 제안할 수 있다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCheckinSummary, cleanDid, cleanScore, todaySeoul } from '@/domains/os/checkin'

export const dynamic = 'force-dynamic'

const TABLE_MISSING = '42P01'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const day = todaySeoul()
    if (!user) return NextResponse.json({ day, checkin: null, guest: true })

    const { data, error } = await createAdminClient()
        .from('checkins')
        .select('id, day, mood, energy, did, blocked')
        .eq('user_id', user.id)
        .eq('day', day)
        .maybeSingle()

    if (error) {
        if (error.code === TABLE_MISSING) return NextResponse.json({ day, checkin: null, tableMissing: true })
        console.error('[os/checkin GET]', error.message)
        return NextResponse.json({ day, checkin: null })
    }
    return NextResponse.json({ day, checkin: data ?? null })
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const b = await req.json().catch(() => ({})) as Record<string, unknown>
    const day = todaySeoul()
    const value = {
        mood: cleanScore(b.mood),
        energy: cleanScore(b.energy),
        did: cleanDid(b.did),
        blocked: typeof b.blocked === 'string' ? b.blocked.trim().slice(0, 200) || null : null,
    }

    const db = createAdminClient()
    const { data, error } = await db
        .from('checkins')
        .upsert({ user_id: user.id, day, ...value }, { onConflict: 'user_id,day' })
        .select('id, day, mood, energy, did, blocked')
        .single()

    if (error) {
        if (error.code === TABLE_MISSING) {
            return NextResponse.json({ error: '체크인 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        }
        console.error('[os/checkin POST]', error.message)
        return NextResponse.json({ error: '저장하지 못했어요' }, { status: 500 })
    }

    // 기억 한 줄. 실패해도 체크인 자체는 성공이다(기억이 대표 일을 막지 않는다).
    try {
        await db.from('user_memories').insert({
            user_id: user.id,
            memory_type: 'context',
            content: buildCheckinSummary(value, day),
            confidence: 1,
        })
    } catch (e) {
        console.error('[os/checkin memory]', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({ checkin: data })
}
