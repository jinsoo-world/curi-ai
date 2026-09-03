import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleGenAI } from '@google/genai'
import { createProactiveNotification } from '@/domains/notification'

export const dynamic = 'force-dynamic'

const GEMINI_MODEL = 'gemini-3-flash-preview'

/**
 * POST /api/proactive
 * 비활성 사용자에게 프로액티브 메시지 전송
 * Cron Job에서 호출 (Vercel Cron / 외부 Cron)
 *
 * Headers: { Authorization: `Bearer ${CRON_SECRET}` }
 */
export async function POST(req: Request) {
    try {
        // 크론 시크릿 검증
        const authHeader = req.headers.get('Authorization')
        const cronSecret = process.env.CRON_SECRET
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = createAdminClient()

        // 24시간 이상 비활성 사용자 조회
        const { data: inactiveUsers, error } = await supabase
            .from('users')
            .select('id, display_name')
            .lt('last_active_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .limit(50)

        if (error || !inactiveUsers?.length) {
            return Response.json({ sent: 0 })
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
        let sent = 0

        for (const user of inactiveUsers) {
            // 각 사용자의 최근 대화 멘토 찾기
            const { data: lastSession } = await supabase
                .from('chat_sessions')
                .select('mentor_id')
                .eq('user_id', user.id)
                .order('last_active', { ascending: false })
                .limit(1)
                .single()

            const mentorId = lastSession?.mentor_id
            if (!mentorId) continue

            // 멘토 정보
            const { data: mentor } = await supabase
                .from('mentors')
                .select('name, personality')
                .eq('id', mentorId)
                .single()

            if (!mentor) continue

            // Gemini로 프로액티브 메시지 생성
            const result = await ai.models.generateContent({
                model: GEMINI_MODEL,
                config: { temperature: 0.8, maxOutputTokens: 100 },
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `당신은 ${mentor.name}입니다. 성격: ${mentor.personality}
사용자 ${user.display_name || ''}님이 하루 넘게 돌아오지 않았습니다.
따뜻하고 자연스럽게 안부를 묻는 짧은 메시지를 작성하세요 (50자 이내).
"돌아와" 같은 부담스러운 표현은 피하세요.`
                    }]
                }],
            })

            const message = result.text?.trim()
            if (message) {
                await createProactiveNotification(supabase, user.id, mentorId, message)
                sent++
            }
        }

        // 사용자 활동 시간 갱신은 별도 처리
        return Response.json({ sent })
    } catch (error) {
        console.error('[Proactive] error:', error)
        return Response.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
