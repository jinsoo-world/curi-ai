// api/notifications/proactive — 48시간 미접속 사용자에게 Proactive 알림 생성
// Vercel Cron 또는 수동 호출용

import { listBlockedMentorIds } from '@/domains/os/blocks'
import { createAdminClient } from '@/lib/supabase/admin'
import { createProactiveNotification } from '@/domains/notification'
import { GEMINI_MODEL } from '@/domains/chat/constants'
import { askSideText } from '@/domains/llm/side-text'

/**
 * POST: 48시간 미접속 사용자 검색 → 멘토 톤 Proactive 메시지 생성
 * 보안: CRON_SECRET 헤더 또는 service_role 권한 필요
 */
export async function POST(req: Request) {
    try {
        // 간단한 보안: CRON_SECRET 체크 (환경변수 설정 시)
        const cronSecret = req.headers.get('x-cron-secret')
        if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createAdminClient()

        // 48시간 미접속 사용자 조회 (last_active_at 기준)
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        const { data: inactiveUsers, error } = await supabase
            .from('users')
            .select('id, display_name, last_active_at')
            .lt('last_active_at', cutoff)
            .limit(50)

        if (error || !inactiveUsers?.length) {
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
            // 이미 읽지 않은 proactive 알림이 있으면 스킵
            const { data: existing } = await supabase
                .from('notifications')
                .select('id')
                .eq('user_id', user.id)
                .eq('type', 'proactive')
                .eq('is_read', false)
                .limit(1)

            if (existing?.length) continue

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
