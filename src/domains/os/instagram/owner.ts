// 인스타그램 연결 창구에서 「어느 봇인가」를 알아본다. 서버 전용.
//   teamBotId = 팀 칸 번호(team_bots.id, 앱의 「내 SNS」가 쓰는 번호) → resolveOwnedBot
//   mentorId  = 봇 번호 → assertBotOwned
// 둘 다 봇 주인(내가 만든 봇)일 때만 봇 번호를 돌려준다. 아니면 BotNotMine.
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertBotOwned, BotNotMine } from '@/domains/os/knowledge'
import { resolveOwnedBot } from '@/domains/os/bot-sns'

const ID_RE = /^[A-Za-z0-9-]{1,64}$/

export async function resolveInstagramBot(db: SupabaseClient, userId: string, a: { mentorId?: unknown; teamBotId?: unknown }): Promise<string> {
    const team = typeof a.teamBotId === 'string' ? a.teamBotId.trim() : ''
    const mentor = typeof a.mentorId === 'string' ? a.mentorId.trim() : ''
    if (team) {
        if (!ID_RE.test(team)) throw new BotNotMine()
        return resolveOwnedBot(db, userId, team)
    }
    if (!mentor || !ID_RE.test(mentor)) throw new BotNotMine()
    await assertBotOwned(db, userId, mentor)
    return mentor
}
