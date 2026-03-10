import { createClient } from '@/lib/supabase/server'
import { getMentorById, buildSystemPrompt, buildGeminiHistory } from '@/domains/mentor'
import { getUserChatContext } from '@/domains/user'
import { generateChatStream, getUserMemories, saveUserMessage, saveAssistantMessage, updateSessionActivity, incrementDailyFreeUsage, detectCrisisKeywords, CRISIS_RESPONSE, ERROR_MESSAGES, extractAndSaveMemories, extractAndUpdateTopic } from '@/domains/chat'
import { MAX_DAILY_FREE, MAX_DAILY_FREE_GUEST } from '@/domains/chat/constants'
import { generateEmbedding, matchKnowledge } from '@/domains/knowledge'
import { deductCredit, getCreditBalance } from '@/domains/credit'
import { CREDIT_CONSTANTS } from '@/domains/credit/types'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        const { messages, mentorId, sessionId, guestMessageCount } = await req.json()
        const lastUserMessage = messages[messages.length - 1]?.content || ''

        // ── 🔒 비로그인 사용자 대화 제한 (클라이언트 카운트 기반) ──
        if (!user && typeof guestMessageCount === 'number' && guestMessageCount >= MAX_DAILY_FREE_GUEST) {
            const encoder = new TextEncoder()
            const guestLimitMsg = '오늘의 무료 체험 대화를 다 사용하셨어요! 🙏\n로그인하시면 하루 20회까지 대화할 수 있어요 ✨'
            const limitStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: guestLimitMsg, done: true, fullResponse: guestLimitMsg })}\n\n`)
                    )
                    controller.close()
                },
            })
            return new Response(limitStream, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            })
        }

        // ── 🛡️ 위기상담 가드레일 (AI 호출 전에 차단) ──
        if (detectCrisisKeywords(lastUserMessage)) {
            const encoder = new TextEncoder()
            const crisisStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: CRISIS_RESPONSE, done: true, fullResponse: CRISIS_RESPONSE })}\n\n`)
                    )
                    controller.close()
                },
            })
            return new Response(crisisStream, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            })
        }

        // 멘토 정보 조회 (domains/mentor)
        const mentor = await getMentorById(supabase, mentorId)
        if (!mentor) {
            return new Response('Mentor not found', { status: 404 })
        }

        // 유저 정보 + 메모리 조회 (domains/user + domains/chat)
        let userProfile: Record<string, unknown> | null = null
        let memories: { content: string; memory_type: string }[] | null = null

        if (user) {
            userProfile = await getUserChatContext(supabase, user.id)
            memories = await getUserMemories(supabase, user.id, mentorId)
        }

        // ── 🔒 무료 대화 제한 체크 ──
        const dailyUsed = (userProfile as any)?.daily_free_used || 0
        const isPremium = (userProfile as any)?.subscription_tier === 'premium'
        if (user && !isPremium && dailyUsed >= MAX_DAILY_FREE) {
            const encoder = new TextEncoder()
            const limitStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: ERROR_MESSAGES.freeUsageDone, done: true, fullResponse: ERROR_MESSAGES.freeUsageDone })}\n\n`)
                    )
                    controller.close()
                },
            })
            return new Response(limitStream, {
                headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
            })
        }

        // ── 💰 크레딧 잔액 체크 ──
        if (user) {
            const { data: creditData } = await supabase
                .from('users')
                .select('credit_balance')
                .eq('id', user.id)
                .single()
            const balance = creditData?.credit_balance ?? 0
            if (balance < CREDIT_CONSTANTS.CHAT_COST_PER_MESSAGE) {
                const encoder = new TextEncoder()
                const noCreditsMsg = '크레딧이 부족합니다 😢\n\n충전 후 다시 대화해주세요! 💰'
                const creditStream = new ReadableStream({
                    start(controller) {
                        controller.enqueue(
                            encoder.encode(`data: ${JSON.stringify({ text: noCreditsMsg, done: true, fullResponse: noCreditsMsg, needsCredit: true })}\n\n`)
                        )
                        controller.close()
                    },
                })
                return new Response(creditStream, {
                    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
                })
            }
        }

        // 시스템 프롬프트 조립 (domains/mentor)
        let systemPrompt = buildSystemPrompt(
            mentor,
            userProfile ? {
                displayName: userProfile.display_name as string,
                interests: userProfile.interests as string[],
                concern: userProfile.concern as string,
                birthYear: userProfile.birth_year as number,
            } : null,
            memories,
        )

        // 📚 RAG 지식 검색 (멘토별 지식 베이스)
        try {
            console.log('[Chat RAG] Generating embedding for:', lastUserMessage.slice(0, 50))
            const embedding = await generateEmbedding(lastUserMessage)
            console.log('[Chat RAG] Embedding length:', embedding.length)
            if (embedding.length > 0) {
                const knowledge = await matchKnowledge(supabase, embedding, mentorId)
                console.log('[Chat RAG] Matched knowledge:', knowledge.length, 'items for mentor:', mentorId)
                if (knowledge.length > 0) {
                    const knowledgeText = knowledge.map(k => `- ${k.content}`).join('\n')
                    const isCreatorBot = !!(mentor as Record<string, unknown>).creator_id
                    if (isCreatorBot) {
                        // 크리에이터 AI: 지식을 최우선으로 활용
                        systemPrompt += `\n\n[📚 핵심 지식 — 반드시 활용]\n${knowledgeText}\n\n중요: 위 지식은 당신의 전문 지식입니다. 사용자 질문에 답할 때 반드시 위 내용을 기반으로 답변하세요. 지식에 없는 내용은 "제가 가진 정보에는 없지만"이라고 솔직하게 말해주세요. 출처를 직접 언급하지 마세요.`
                    } else {
                        // 프리셋 멘토: 기존 방식 (참고용)
                        systemPrompt += `\n\n[참고 지식]\n${knowledgeText}\n참고: 위 지식을 대화에 자연스럽게 활용하되, 출처를 직접 언급하지 마세요.`
                    }
                } else {
                    console.log('[Chat RAG] No knowledge matched above threshold for mentor:', mentorId)
                }
            } else {
                console.log('[Chat RAG] Empty embedding returned')
            }
        } catch (ragErr) {
            console.error('[Chat RAG] Error:', ragErr instanceof Error ? ragErr.message : ragErr)
            // RAG 검색 실패는 대화에 영향 없음 — 지식 없이 일반 대화 진행
        }

        // Gemini 대화 히스토리 구성 (domains/mentor)
        const geminiMessages = buildGeminiHistory(mentor.greeting_message, messages)

        // 스트리밍 응답 (domains/chat)
        const response = await generateChatStream(systemPrompt, geminiMessages)

        // SSE 스트림 생성
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
            async start(controller) {
                let fullResponse = ''
                // 🧹 내부 사고 패턴 필터링 정규식
                // (생각), (분석), (판단) 등 괄호 안 사고 과정 + 관련 분석 라벨 제거
                const thinkingPatterns = [
                    /\(생각\)[^]*?(?=\n\n|$)/g,
                    /\(분석\)[^]*?(?=\n\n|$)/g,
                    /\(판단\)[^]*?(?=\n\n|$)/g,
                    /\(내부 분석\)[^]*?(?=\n\n|$)/g,
                    /\(사고\)[^]*?(?=\n\n|$)/g,
                    /^\s*(공감\/이해|페르소나 연결|핵심 원칙 적용|간결한 답변|톤 유지|이전 답변):.*$/gm,
                ]
                function stripThinkingPatterns(text: string): string {
                    let cleaned = text
                    for (const pattern of thinkingPatterns) {
                        cleaned = cleaned.replace(pattern, '')
                    }
                    // 연속 빈줄 정리
                    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
                    return cleaned
                }

                try {
                    let rawResponse = ''
                    for await (const chunk of response) {
                        const text = chunk.text || ''
                        if (text) {
                            rawResponse += text
                            // 실시간으로 사고 패턴 제거 후 전달
                            const cleaned = stripThinkingPatterns(rawResponse)
                            const newText = cleaned.slice(fullResponse.length)
                            if (newText) {
                                fullResponse = cleaned
                                controller.enqueue(
                                    encoder.encode(`data: ${JSON.stringify({ text: newText, done: false })}\n\n`)
                                )
                            }
                        }
                    }

                    // 최종 정리
                    fullResponse = stripThinkingPatterns(rawResponse)

                    // 완료 시 메시지 저장 (domains/chat)
                    const isGuestSession = !sessionId || sessionId.startsWith('guest-')
                    if (!isGuestSession && fullResponse && sessionId) {
                        await saveUserMessage(supabase, sessionId, lastUserMessage)
                        await saveAssistantMessage(supabase, sessionId, fullResponse)
                        await updateSessionActivity(supabase, sessionId, messages.length + 1)

                        if (user) {
                            const dailyUsed = (userProfile as any)?.daily_free_used || 0
                            await incrementDailyFreeUsage(supabase, user.id, dailyUsed)

                            // 💰 크레딧 차감 (fire-and-forget)
                            deductCredit({
                                user_id: user.id,
                                amount: CREDIT_CONSTANTS.CHAT_COST_PER_MESSAGE,
                                mentor_id: mentorId,
                                description: `대화 차감 (${mentor.name})`,
                            }).catch(err => console.error('[Chat] Credit deduction failed:', err))

                            // 🧠 메모리 추출 (fire-and-forget, 응답 속도에 영향 없음)
                            extractAndSaveMemories(supabase, user.id, mentorId, lastUserMessage, fullResponse)
                                .catch(err => console.error('[Chat] Memory extraction failed:', err))

                            // 📝 주제 자동 추출 (fire-and-forget, 2/4/8턴마다)
                            extractAndUpdateTopic(supabase, sessionId, messages.length + 1)
                                .catch(err => console.error('[Chat] Topic extraction failed:', err))
                        }
                    }

                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: '', done: true, fullResponse })}\n\n`)
                    )
                } catch (error) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: ERROR_MESSAGES.streamError, done: true })}\n\n`)
                    )
                } finally {
                    controller.close()
                }
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        })
    } catch (error) {
        console.error('Chat API error:', error)
        return new Response(
            JSON.stringify({ error: ERROR_MESSAGES.serverError }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
