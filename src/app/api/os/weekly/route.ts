// GET /api/os/weekly → 세부칸 「이번 주」 카드 숫자 4개
//
// 표가 하나라도 아직 없으면 그 칸만 0 으로 둔다. 화면을 죽이지 않는다.
// 셈은 전부 domains/os/weekly(순수)가 하고, 여기는 읽어 오기만 한다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { summarizeWeek, weekStartSeoul, EMPTY_WEEK } from '@/domains/os/weekly'
import { todaySeoul } from '@/domains/os/checkin'

export const dynamic = 'force-dynamic'

/** 표가 없거나 읽기가 깨지면 빈 목록. 「이번 주 카드」는 없어도 되는 화면이다 */
async function 안전하게<T>(work: Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
    try {
        const { data } = await work
        return data ?? []
    } catch {
        return []
    }
}

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ week: EMPTY_WEEK, guest: true })

    const now = new Date()
    const 주시작 = weekStartSeoul(now)
    const 주시작시각 = `${주시작}T00:00:00+09:00`
    const db = createAdminClient()

    try {
        const [steps, approvals, checkins, bots] = await Promise.all([
            안전하게<{ due_on: string | null; done_at: string | null; created_at: string }>(
                db.from('next_steps').select('due_on, done_at, created_at').eq('user_id', user.id).limit(500) as never,
            ),
            안전하게<{ status: string }>(
                db.from('permission_requests').select('status').eq('user_id', user.id).gte('created_at', 주시작시각).limit(500) as never,
            ),
            안전하게<{ day: string }>(
                db.from('checkins').select('day').eq('user_id', user.id).gte('day', 주시작).limit(20) as never,
            ),
            안전하게<{ mentor_id: string }>(
                db.from('team_bots').select('mentor_id').eq('user_id', user.id).limit(200) as never,
            ),
        ])

        let knowledgeCount = 0
        const mentorIds = bots.map(b => b.mentor_id).filter(Boolean)
        if (mentorIds.length) {
            const rows = await 안전하게<{ id: string }>(
                db.from('knowledge_sources').select('id').in('mentor_id', mentorIds).gte('created_at', 주시작시각).limit(500) as never,
            )
            knowledgeCount = rows.length
        }

        const week = summarizeWeek(
            { nextSteps: steps, approvals, checkinDays: checkins.map(c => c.day), knowledgeCount },
            todaySeoul(now),
        )
        return NextResponse.json({ week, weekStart: 주시작 })
    } catch (e) {
        console.error('[os/weekly]', e instanceof Error ? e.message : e)
        return NextResponse.json({ week: EMPTY_WEEK, weekStart: 주시작 })
    }
}
