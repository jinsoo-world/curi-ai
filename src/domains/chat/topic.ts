// domains/chat — 세션 주제(토픽) 자동 추출 및 업데이트
// 대화 2~3턴마다 사용자의 핵심 니즈를 파악하여 한 줄 제목을 생성/갱신

import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL } from './constants'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

/**
 * 세션의 대화 내용을 분석하여 주제(title)를 추출하고 업데이트
 * 
 * 호출 타이밍:
 * - message_count가 2, 4, 8일 때 실행 (초반에 자주, 이후 간격 넓힘)
 * - fire-and-forget으로 호출하여 응답 속도에 영향 없음
 */
export async function extractAndUpdateTopic(
    db: SupabaseClient,
    sessionId: string,
    messageCount: number,
): Promise<void> {
    try {
        // 주제 업데이트 시점: 2턴, 4턴, 8턴, 이후 8턴마다
        const shouldUpdate =
            messageCount === 2 ||
            messageCount === 4 ||
            messageCount === 8 ||
            (messageCount > 8 && messageCount % 8 === 0)

        if (!shouldUpdate) return

        // 세션의 최근 메시지 가져오기 (최대 10개)
        const { data: messages } = await db
            .from('messages')
            .select('role, content')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .limit(10)

        if (!messages || messages.length < 2) return

        // 기존 제목 가져오기
        const { data: session } = await db
            .from('chat_sessions')
            .select('title')
            .eq('id', sessionId)
            .single()

        const currentTitle = session?.title || ''

        // 대화 내용을 요약용 텍스트로 구성
        const conversationText = messages
            .map(m => `${m.role === 'user' ? '사용자' : '멘토'}: ${m.content.slice(0, 200)}`)
            .join('\n')

        const result = await getAI().models.generateContent({
            model: GEMINI_MODEL,
            config: {
                temperature: 0.1,
                maxOutputTokens: 100,
            },
            contents: [{
                role: 'user',
                parts: [{
                    text: `아래 대화의 핵심 주제를 한국어 한 줄(15~30자)로 요약하세요.
사용자가 멘토에게 무엇을 물어보고 있는지, 핵심 니즈를 반영하세요.

규칙:
- 반드시 15~30자 이내
- 명사형 또는 질문형으로 끝내세요 (예: "콘텐츠 수익화 시작 방법", "블로그 글쓰기 루틴 만들기")
- 이모지, 따옴표, 줄바꿈 없이 순수 텍스트만
- 대화 전체의 핵심 주제 하나만 추출
${currentTitle ? `- 기존 주제: "${currentTitle}" — 대화 흐름이 바뀌었으면 새 주제로, 같으면 더 정확하게 다듬으세요` : ''}

대화:
${conversationText}

주제:`
                }]
            }],
        })

        const topic = (result.text || '')
            .trim()
            .replace(/^["']|["']$/g, '')  // 따옴표 제거
            .replace(/\n/g, '')            // 줄바꿈 제거
            .slice(0, 50)                  // 안전 제한

        if (!topic || topic.length < 3) return

        // DB 업데이트
        const { error } = await db
            .from('chat_sessions')
            .update({ title: topic })
            .eq('id', sessionId)

        if (error) {
            console.error('[Topic] Update error:', JSON.stringify(error))
        } else {
            console.log(`[Topic] Session ${sessionId}: "${topic}"`)
        }
    } catch (error) {
        // 주제 추출 실패는 대화에 영향 없음
        console.error('[Topic] extractAndUpdateTopic error:', error)
    }
}
