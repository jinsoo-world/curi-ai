import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 15

// 키워드 기반 멘토 매칭 (Gemini 실패 시 폴백)
function matchByKeyword(concern: string, mentors: any[]) {
    const c = concern.toLowerCase()
    const keywords: Record<string, string[]> = {
        '열정진': ['콘텐츠', '수익', '브랜딩', '크리에이터', '유튜브', '강의', '퍼스널', '부업', '돈', '수입', '창업'],
        '갓출리더의 홧병상담소': ['답답', '불안', '걱정', '힘들', '지쳐', '스트레스', '우울', '마음', '인생', '고민', '관계', '외롭', '후반전'],
        '봉이 김선달': ['세일즈', '영업', '판매', '협상', '설득', '고객', '물건', '파는', '마케팅', '가격'],
    }
    
    let bestMentor = mentors[0]
    let bestScore = 0
    
    for (const mentor of mentors) {
        const kws = keywords[mentor.name] || []
        const score = kws.filter(kw => c.includes(kw)).length
        if (score > bestScore) {
            bestScore = score
            bestMentor = mentor
        }
    }
    
    return bestMentor
}

export async function POST(request: NextRequest) {
    try {
        const { concern } = await request.json()

        if (!concern || typeof concern !== 'string' || concern.trim().length < 2) {
            return NextResponse.json({ error: '고민을 입력해주세요.' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 활성 멘토 목록 가져오기
        const { data: mentors, error: dbError } = await supabase
            .from('mentors')
            .select('id, name, title, description, expertise, avatar_url, sample_questions')
            .eq('is_active', true)

        if (dbError) {
            console.error('[Mentor Match] DB Error:', dbError.message)
            return NextResponse.json({ error: 'DB 오류' }, { status: 500 })
        }

        if (!mentors || mentors.length === 0) {
            return NextResponse.json({ error: '활성 멘토가 없습니다.' }, { status: 500 })
        }

        // Gemini로 매칭 시도
        let matched = null
        let reason = ''
        let firstMessage = ''

        try {
            const { GoogleGenAI } = await import('@google/genai')
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

            const mentorInfo = mentors.map((m, i) => 
                `${i + 1}. "${m.name}" — ${m.title}${m.expertise?.length ? ` (전문: ${m.expertise.join(', ')})` : ''}`
            ).join('\n')

            const result = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                config: { temperature: 0.7, maxOutputTokens: 256 },
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `사용자 고민: "${concern.trim()}"
멘토 목록:
${mentorInfo}

가장 적합한 멘토 1명 선택. JSON만 출력:
{"mentor_name":"이름","reason":"20자 이내 이유","first_message":"멘토 말투로 2문장 이내 첫 메시지"}`
                    }]
                }],
            })

            const responseText = result.text || ''
            console.log('[Mentor Match] Gemini response:', responseText.slice(0, 200))

            const jsonMatch = responseText.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0])
                matched = mentors.find(m => m.name === parsed.mentor_name)
                reason = parsed.reason || ''
                firstMessage = parsed.first_message || ''
            }
        } catch (geminiError: any) {
            console.error('[Mentor Match] Gemini failed:', geminiError.message)
            // Gemini 실패 → 키워드 매칭 폴백
        }

        // 매칭 실패 시 키워드 기반 폴백
        if (!matched) {
            matched = matchByKeyword(concern, mentors)
            reason = '키워드 기반 추천'
            firstMessage = matched.sample_questions?.[0] || ''
        }

        return NextResponse.json({
            mentor: matched,
            reason: reason || '당신에게 딱 맞는 멘토!',
            firstMessage,
        })

    } catch (error: any) {
        console.error('[Mentor Match Error]', error.message, error.stack?.slice(0, 300))
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
