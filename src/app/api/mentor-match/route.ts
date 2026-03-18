import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 15

export async function POST(request: NextRequest) {
    try {
        const { concern } = await request.json()

        if (!concern || typeof concern !== 'string' || concern.trim().length < 2) {
            return NextResponse.json({ error: '고민을 입력해주세요.' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // 활성 멘토 목록 가져오기
        const { data: mentors } = await supabase
            .from('mentors')
            .select('id, name, title, description, expertise, avatar_url, sample_questions')
            .eq('is_active', true)

        if (!mentors || mentors.length === 0) {
            return NextResponse.json({ error: '활성 멘토가 없습니다.' }, { status: 500 })
        }

        // 멘토 정보로 매칭 프롬프트 구성
        const mentorInfo = mentors.map((m, i) => 
            `${i + 1}. "${m.name}" — ${m.title}${m.expertise?.length ? ` (전문: ${m.expertise.join(', ')})` : ''}${m.description ? ` | ${m.description.slice(0, 80)}` : ''}`
        ).join('\n')

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: `당신은 AI 멘토 매칭 전문가입니다.

사용자의 고민: "${concern.trim()}"

활성 멘토 목록:
${mentorInfo}

위 멘토 중 사용자의 고민에 가장 적합한 멘토 1명을 선택하세요.
응답 형식 (반드시 JSON만 출력):
{
  "mentor_name": "선택한 멘토 이름 (정확히)",
  "reason": "20자 이내의 짧은 매칭 이유 (예: '세일즈 고민엔 역시!')",
  "first_message": "사용자의 고민을 반영한 멘토의 첫 대화 메시지 (해당 멘토의 말투와 캐릭터로, 2문장 이내)"
}`,
        })

        const responseText = result.text || ''
        
        // JSON 파싱
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            // 파싱 실패 시 첫 번째 멘토 반환
            const fallback = mentors[0]
            return NextResponse.json({
                mentor: fallback,
                reason: '추천 멘토',
                firstMessage: fallback.sample_questions?.[0] || '',
            })
        }

        const parsed = JSON.parse(jsonMatch[0])
        const matched = mentors.find(m => m.name === parsed.mentor_name) || mentors[0]

        return NextResponse.json({
            mentor: matched,
            reason: parsed.reason || '당신에게 딱 맞는 멘토!',
            firstMessage: parsed.first_message || '',
        })

    } catch (error) {
        console.error('[Mentor Match Error]', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
