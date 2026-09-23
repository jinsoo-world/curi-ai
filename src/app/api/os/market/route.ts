// GET /api/os/market → 봇 마켓 목록(공개 봇들). 새 봇 시트의 「봇 마켓에서 가져오기」 탭이 쓴다.
// 이미 있는 조각만 모은다: getActiveMentors(목록) + getLinkCounts(N명이 넣었어요) + creator_profiles·users(리더 실제 사진).
// 내 팀에 이미 있는 봇은 inTeam=true 로 표시한다(단추를 「이미 있어요」로 바꾼다).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveMentors } from '@/domains/mentor'
import { getLinkCounts } from '@/domains/os/team-link'

export const dynamic = 'force-dynamic'

export interface MarketBot {
    mentorId: string
    name: string
    avatarUrl: string | null
    oneLiner: string
    creatorName: string | null
    creatorAvatarUrl: string | null
    linkCount: number
    inTeam: boolean
}

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const db = createAdminClient()

        const mentors = await getActiveMentors()
        if (mentors.length === 0) return NextResponse.json({ guest: !user, bots: [] })

        const linkCounts = await getLinkCounts(db, mentors.map(m => m.id))

        // 리더 실제 사진 (creator_profiles → users.avatar_url), 있는 것만 한 번에
        const creatorIds = [...new Set(mentors.map(m => m.creator_id).filter((v): v is string => !!v))]
        const creatorAvatar = new Map<string, { name: string | null; avatarUrl: string | null }>()
        if (creatorIds.length > 0) {
            const { data: creators } = await db.from('creator_profiles').select('id, user_id, display_name').in('id', creatorIds)
            const userIds = [...new Set((creators ?? []).map(c => c.user_id).filter(Boolean))]
            const avatarByUser = new Map<string, string | null>()
            if (userIds.length > 0) {
                const { data: users } = await db.from('users').select('id, avatar_url').in('id', userIds)
                for (const u of users ?? []) avatarByUser.set(u.id, u.avatar_url ?? null)
            }
            for (const c of creators ?? []) {
                creatorAvatar.set(c.id, { name: c.display_name ?? null, avatarUrl: avatarByUser.get(c.user_id) ?? null })
            }
        }

        // 내 팀에 이미 있는 봇 (한 번에)
        const myMentorIds = new Set<string>()
        if (user) {
            const { data: mine } = await db.from('team_bots').select('mentor_id').eq('user_id', user.id).in('mentor_id', mentors.map(m => m.id))
            for (const r of mine ?? []) myMentorIds.add(r.mentor_id as string)
        }

        const bots: MarketBot[] = mentors.map(m => {
            const creator = m.creator_id ? creatorAvatar.get(m.creator_id) : null
            return {
                mentorId: m.id,
                name: m.name,
                avatarUrl: m.avatar_url ?? null,
                oneLiner: m.title || (m.description ?? '').slice(0, 40),
                creatorName: creator?.name ?? null,
                creatorAvatarUrl: creator?.avatarUrl ?? null,
                linkCount: linkCounts.get(m.id)?.linkCount ?? 0,
                inTeam: myMentorIds.has(m.id),
            }
        })

        return NextResponse.json({ guest: !user, bots })
    } catch (e) {
        console.error('[os/market GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ guest: true, bots: [] })
    }
}
