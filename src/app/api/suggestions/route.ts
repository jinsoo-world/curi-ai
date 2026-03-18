import { createClient } from '@/lib/supabase/server'
import { generateSuggestions } from '@/domains/chat'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const { messages, mentorId, mentorName } = await req.json()

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // 비로그인 사용자 또는 첫 대화: DB에서 멘토의 sample_questions 가져오기
        if (!user || !messages?.length) {
            let suggestions: string[] = []

            if (mentorId) {
                try {
                    const admin = createAdminClient()
                    const { data: mentor } = await admin
                        .from('mentors')
                        .select('sample_questions')
                        .eq('id', mentorId)
                        .single()

                    if (mentor?.sample_questions?.length) {
                        // sample_questions에서 랜덤 3개 선택
                        const shuffled = [...mentor.sample_questions].sort(() => Math.random() - 0.5)
                        suggestions = shuffled.slice(0, 3)
                    }
                } catch { /* DB 조회 실패 시 빈 배열 */ }
            }

            return Response.json({ suggestions })
        }

        // 로그인 사용자: AI 기반 추천질문 생성
        const suggestions = await generateSuggestions(messages, mentorName)
        return Response.json({ suggestions })
    } catch (error) {
        console.error('Suggestions error:', error)
        return Response.json({ suggestions: [] })
    }
}
