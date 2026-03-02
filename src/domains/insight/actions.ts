// 인사이트 생성 액션 — Gemini로 대화에서 핵심 인사이트 추출

import { GoogleGenAI } from '@google/genai'
import { saveInsight } from './queries'

let aiInstance: GoogleGenAI | null = null

function getAI(): GoogleGenAI {
    if (!aiInstance) {
        aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    }
    return aiInstance
}

interface GenerateInsightParams {
    userId: string
    sessionId: string
    mentorId: string
    mentorName: string
    messages: { role: string; content: string }[]
}

/**
 * 대화 메시지에서 인사이트를 추출하여 DB에 저장
 */
export async function generateAndSaveInsight(params: GenerateInsightParams) {
    const { userId, sessionId, mentorId, mentorName, messages } = params

    // 최근 대화만 사용 (토큰 절약)
    const recentMessages = messages.slice(-10)
    const conversationText = recentMessages
        .map(m => `${m.role === 'user' ? '사용자' : mentorName}: ${m.content}`)
        .join('\n')

    const prompt = `당신은 멘토링 대화에서 핵심 인사이트를 추출하는 전문가입니다.

아래 대화에서 사용자에게 가장 유용한 핵심 인사이트 1개를 추출해주세요.

## 대화:
${conversationText}

## 응답 형식 (JSON):
{
    "title": "인사이트 제목 (20자 이내, 핵심을 담은 한 문장)",
    "content": "인사이트 내용 (3~5문장, 실천 가능한 조언 포함)",
    "tags": ["태그1", "태그2", "태그3"]
}

## 규칙:
- 제목은 사용자가 공유하고 싶을 만큼 임팩트 있게
- 내용은 대화의 핵심을 요약하되, 실천 포인트를 포함
- 태그는 2~4개, 해시태그 없이 키워드만
- 반드시 유효한 JSON만 응답
- 한국어로 작성`

    try {
        const ai = getAI()
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.7,
                maxOutputTokens: 500,
            },
        })

        const text = response.text || ''
        // JSON 추출 (코드블록 포함 가능)
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON found in response')

        const parsed = JSON.parse(jsonMatch[0])

        // DB 저장
        const saved = await saveInsight({
            user_id: userId,
            session_id: sessionId,
            mentor_id: mentorId,
            mentor_name: mentorName,
            title: parsed.title,
            content: parsed.content,
            tags: parsed.tags || [],
        })

        return saved
    } catch (error) {
        console.error('[Insight] Generation error:', error)
        return null
    }
}
