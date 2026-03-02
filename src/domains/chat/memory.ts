// domains/chat — 대화 메모리 추출 및 저장

import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'
import { GEMINI_MODEL } from './constants'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

interface ExtractedMemory {
    memory_type: 'fact' | 'preference' | 'context'
    content: string
    confidence: number
}

/**
 * 대화에서 핵심 정보를 추출하여 user_memories에 저장
 * 스트림 완료 후 비동기(fire-and-forget)로 호출
 */
export async function extractAndSaveMemories(
    db: SupabaseClient,
    userId: string,
    mentorId: string,
    userMessage: string,
    assistantResponse: string,
): Promise<void> {
    try {
        // 너무 짧은 대화는 스킵 (메모리 추출 가치 없음)
        if (userMessage.length < 10) return

        const result = await getAI().models.generateContent({
            model: GEMINI_MODEL,
            config: {
                temperature: 0.1,
                maxOutputTokens: 512,
            },
            contents: [{
                role: 'user',
                parts: [{
                    text: `아래 대화에서 사용자에 대해 기억할 만한 정보를 추출하세요.
없으면 빈 배열 []을 반환하세요. 있으면 JSON 배열로 반환하세요.

규칙:
- 일반적인 인사나 잡담은 추출하지 마세요
- 사용자의 구체적인 사실, 선호, 상황만 추출하세요
- 최대 3개까지만 추출하세요

memory_type 분류:
- "fact": 사용자의 객관적 사실 (직업, 거주지, 가족, 나이 등)
- "preference": 사용자의 선호/취향 (좋아하는 것, 싫어하는 것, 스타일)
- "context": 사용자의 현재 상황/고민 (진행 중인 일, 목표, 어려움)

사용자: ${userMessage}
멘토: ${assistantResponse}

응답 형식 (JSON 배열만, 설명 없이):
[{"memory_type": "fact", "content": "서울에서 프리랜서 작가로 활동 중", "confidence": 0.9}]`
                }]
            }],
        })

        const text = result.text || '[]'
        const match = text.match(/\[[\s\S]*\]/)
        if (!match) return

        const memories: ExtractedMemory[] = JSON.parse(match[0])
        if (!memories.length) return

        // 기존 메모리와 중복 체크 후 저장
        for (const mem of memories) {
            if (!mem.content || mem.content.length < 3) continue

            // 같은 내용의 메모리가 있는지 간단 체크
            const { data: existing } = await db
                .from('user_memories')
                .select('id, content')
                .eq('user_id', userId)
                .eq('mentor_id', mentorId)
                .eq('memory_type', mem.memory_type)
                .limit(20)

            // 유사한 메모리가 있으면 업데이트, 없으면 새로 삽입
            const duplicate = existing?.find(e =>
                e.content.includes(mem.content) || mem.content.includes(e.content)
            )

            if (duplicate) {
                // 기존 메모리를 더 최신 정보로 업데이트
                await db.from('user_memories')
                    .update({
                        content: mem.content,
                        confidence: mem.confidence,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', duplicate.id)
            } else {
                await db.from('user_memories').insert({
                    user_id: userId,
                    mentor_id: mentorId,
                    memory_type: mem.memory_type,
                    content: mem.content,
                    confidence: mem.confidence || 0.8,
                })
            }
        }

        console.log(`[Memory] Extracted ${memories.length} memories for user ${userId}`)
    } catch (error) {
        // 메모리 추출 실패는 대화에 영향 없음 — 조용히 로깅
        console.error('[Memory] extractAndSaveMemories error:', error)
    }
}
