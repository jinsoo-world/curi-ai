// api/notifications/proactive — 48시간 미접속 사용자에게 Proactive 알림 생성
// Vercel Cron 또는 수동 호출용

import { createAdminClient } from '@/lib/supabase/admin'
import { createProactiveNotification } from '@/domains/notification'
import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL } from '@/domains/chat/constants'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

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

            // 랜덤 멘토 선택
            const mentor = mentors[Math.floor(Math.random() * mentors.length)]

            // 멘토 톤으로 메시지 생성
            const message = await generateProactiveMessage(
                mentor.name,
                user.display_name || '회원',
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
): Promise<string> {
    try {
        const result = await getAI().models.generateContent({
            model: GEMINI_MODEL,
            config: {
                temperature: 0.9,
                maxOutputTokens: 128,
            },
            contents: [{
                role: 'user',
                parts: [{
                    text: `당신은 "${mentorName}" 멘토입니다.
"${userName}"님이 2일째 대화하지 않았어요.
다시 돌아오고 싶게 만드는 짧은 인앱 메시지(1~2문장)를 작성하세요.
판매 냄새가 나면 안 됩니다. 자연스럽고 따뜻하게.
이모지 1개 포함. 메시지만 출력하세요.`
                }]
            }],
        })

        return result.text?.trim() || `${userName}님, 요즘 어떻게 지내세요? 궁금한 거 있으면 편하게 물어봐 주세요 😊`
    } catch {
        return `${userName}님, 요즘 어떻게 지내세요? 궁금한 거 있으면 편하게 물어봐 주세요 😊`
    }
}
