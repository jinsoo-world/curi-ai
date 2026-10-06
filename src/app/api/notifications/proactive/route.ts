// api/notifications/proactive — 48시간 미접속 사용자에게 Proactive 알림 생성
// Vercel Cron 또는 수동 호출용

import { listBlockedMentorIds } from '@/domains/os/blocks'
import { createAdminClient } from '@/lib/supabase/admin'
import { createProactiveNotification, pickInactiveNotNudged } from '@/domains/notification'
import { GEMINI_MODEL } from '@/domains/chat/constants'
import { askSideText } from '@/domains/llm/side-text'

/**
 * POST: 48시간 미접속 사용자 검색 → 멘토 톤 Proactive 메시지 생성
 * 보안: CRON_SECRET 헤더 또는 service_role 권한 필요
 */
export async function POST(req: Request) {
    try {
        // CRON_SECRET 체크. 열쇠가 설정돼 있지 않으면 통과시키던 것을 거절로 (다른 예약 작업과 같은 규칙)
        const cronSecret = req.headers.get('x-cron-secret')
        if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createAdminClient()

        // 48시간 미접속 사용자 중 아직 안 읽은 먼저 말 걸기가 없는 사람만, 50명 (이미 받은 사람을 먼저 거른다)
        const inactiveUsers = await pickInactiveNotNudged(supabase, { inactiveBefore: new Date(Date.now() - 48 * 60 * 60 * 1000), limit: 50 })

        if (!inactiveUsers.length) {
            return Response.json({
                message: 'No inactive users found',
                count: 0,
            })
        }

        // 각 사용자에 대해 활성 멘토 중 랜덤으로 선택하여 메시지 생성
        const { data: mentors } = await supabase
            .from('mentors')
            .select('id, name, title, greeting_message')
            .eq('is_active', true)

        if (!mentors?.length) {
            return Response.json({ message: 'No active mentors', count: 0 })
        }

        let created = 0

        for (const user of inactiveUsers) {
            // 랜덤 멘토 선택 (내가 차단한 봇은 빼고)
            const blocked = await listBlockedMentorIds(supabase, user.id)
            const pool = mentors.filter(m => !blocked.has(m.id))
            if (pool.length === 0) continue
            const mentor = pool[Math.floor(Math.random() * pool.length)]

            // 멘토 톤으로 메시지 생성
            const message = await generateProactiveMessage(
                mentor.name,
                user.display_name || '회원',
                { userId: user.id, mentorId: mentor.id },
            )

            await createProactiveNotification(supabase, user.id, mentor.id, message)
            created++
        }

        return Response.json({
            message: `Created ${created} proactive notifications`,
            count: created,
        })
    } catch (error) {
        console.error('[Proactive] error:', error)
        return Response.json({ error: 'Internal error' }, { status: 500 })
    }
}

/**
 * 멘토 톤으로 Proactive 메시지 생성
 */
async function generateProactiveMessage(
    mentorName: string,
    userName: string,
    usage: { userId?: string | null; mentorId?: string | null } = {},
): Promise<string> {
    try {
        // 곁일 입구(SIDE_TEXT_PROVIDER). 비용 기록도 거기서 남긴다
        const answer = await askSideText({
            kind: 'proactive', route: '/api/notifications/proactive', userId: usage.userId, mentorId: usage.mentorId,
            geminiModel: GEMINI_MODEL, temperature: 0.9, maxTokens: 128,
            prompt: `당신은 "${mentorName}" 멘토입니다.
"${userName}"님이 2일째 대화하지 않았어요.
다시 돌아오고 싶게 만드는 짧은 인앱 메시지(1~2문장)를 작성하세요.
판매 냄새가 나면 안 됩니다. 자연스럽고 따뜻하게.
이모지 1개 포함. 메시지만 출력하세요.`,
        })

        return answer || `${userName}님, 요즘 어떻게 지내세요? 궁금한 거 있으면 편하게 물어봐 주세요 😊`
    } catch {
        return `${userName}님, 요즘 어떻게 지내세요? 궁금한 거 있으면 편하게 물어봐 주세요 😊`
    }
}
