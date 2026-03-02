import { createClient } from '@/lib/supabase/server'
import { getMentorById, buildSystemPrompt, buildGeminiHistory } from '@/domains/mentor'
import { getUserChatContext } from '@/domains/user'
import { generateChatStream, getUserMemories, saveUserMessage, saveAssistantMessage, updateSessionActivity, incrementDailyFreeUsage, detectCrisisKeywords, CRISIS_RESPONSE, ERROR_MESSAGES, extractAndSaveMemories, extractAndUpdateTopic } from '@/domains/chat'
import { MAX_DAILY_FREE, MAX_DAILY_FREE_GUEST } from '@/domains/chat/constants'
import { generateEmbedding, matchKnowledge } from '@/domains/knowledge'

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
            const embedding = await generateEmbedding(lastUserMessage)
            if (embedding.length > 0) {
                const knowledge = await matchKnowledge(supabase, embedding, mentorId)
                if (knowledge.length > 0) {
                    const knowledgeText = knowledge.map(k => `- ${k.content}`).join('\n')
                    systemPrompt += `\n\n[참고 지식]\n${knowledgeText}\n참고: 위 지식을 대화에 자연스럽게 활용하되, 출처를 직접 언급하지 마세요.`
                }
            }
        } catch {
            // RAG 검색 실패는 대화에 영향 없음
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

                try {
                    for await (const chunk of response) {
                        const text = chunk.text || ''
                        if (text) {
                            fullResponse += text
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({ text, done: false })}\n\n`)
                            )
                        }
                    }

                    // 완료 시 메시지 저장 (domains/chat)
                    const isGuestSession = !sessionId || sessionId.startsWith('guest-')
                    if (!isGuestSession && fullResponse && sessionId) {
                        await saveUserMessage(supabase, sessionId, lastUserMessage)
                        await saveAssistantMessage(supabase, sessionId, fullResponse)
                        await updateSessionActivity(supabase, sessionId, messages.length + 1)

                        if (user) {
                            const dailyUsed = (userProfile as any)?.daily_free_used || 0
                            await incrementDailyFreeUsage(supabase, user.id, dailyUsed)

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
