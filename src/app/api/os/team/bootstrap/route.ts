// POST /api/os/team/bootstrap → 팀이 비어 있으면 기본 봇(기획팀장, 홍보팀장, 개발팀장 + 비서실장)을 만든다.
// 대표 확정 0923 「초기 세팅은 기획팀장 / 홍보팀장 / 개발팀장」, 4번째 비서실장은 부대표 추천(미확정).
// 봇이 하나라도 있으면 그대로 돌려준다(옛 3명 계정에 4번째를 보태지 않는다, 두 번 눌러도 안 늘어남).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bootstrapDefaultTeam, TeamTableMissing } from '@/domains/os'

export const dynamic = 'force-dynamic'

export async function POST() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || '주인'
    try {
        const { team, created } = await bootstrapDefaultTeam(createAdminClient(), { id: user.id, displayName })
        return NextResponse.json({ team, created })
    } catch (e) {
        if (e instanceof TeamTableMissing) return NextResponse.json({ team: [], tableMissing: true })
        // 원인 문장은 서버 로그에만. 화면엔 쉬운 말
        console.error('[os/team/bootstrap]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '기본 팀을 만들지 못했어요' }, { status: 500 })
    }
}
