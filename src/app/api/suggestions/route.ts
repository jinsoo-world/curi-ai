import { createClient } from '@/lib/supabase/server'
import { generateSuggestions } from '@/domains/chat'
import { getMentorById } from '@/domains/mentor'

export const dynamic = 'force-dynamic'

/** 멘토별 기본 추천질문 (비로그인 / API 실패 시 폴백) */
const DEFAULT_SUGGESTIONS: Record<string, string[]> = {
    '열정진': [
        '콘텐츠로 수익을 만들려면 뭐부터 해야 해요?',
        '퍼스널 브랜딩, 어디서부터 시작하면 될까요?',
        '부업으로 시작할 수 있는 콘텐츠 아이디어 있어요?',
    ],
    '글담쌤': [
        '글쓰기를 잘하고 싶은데 어떻게 연습하면 될까요?',
        '블로그를 시작하려는데 주제를 못 정하겠어요',
        '매일 글쓰기 습관, 어떻게 만들 수 있을까요?',
    ],
    'Cathy': [
        '인스타 마케팅, 뭐부터 시작해야 해요?',
        '커뮤니티 운영 노하우가 궁금해요',
        '마케팅 전략을 세우는 기본 프레임이 있을까요?',
    ],
}

export async function POST(req: Request) {
    try {
        const { messages, mentorId, mentorName } = await req.json()

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // 비로그인 사용자: 멘토 이름으로 기본 추천질문 반환
        if (!user) {
            // mentorId로 멘토 이름 조회 시도
            let name = mentorName || ''
            if (!name && mentorId) {
                try {
                    const mentor = await getMentorById(supabase, mentorId)
                    name = mentor?.name || ''
                } catch { }
            }
            const fallback = DEFAULT_SUGGESTIONS[name] || DEFAULT_SUGGESTIONS['열정진']
            return Response.json({ suggestions: fallback })
        }

        // 로그인 사용자: AI 기반 추천질문 생성
        const suggestions = await generateSuggestions(messages, mentorName)
        return Response.json({ suggestions })
    } catch (error) {
        console.error('Suggestions error:', error)
        return Response.json({ suggestions: [] })
    }
}
