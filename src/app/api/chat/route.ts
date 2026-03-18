import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMentorById, buildSystemPrompt, buildGeminiHistory } from '@/domains/mentor'
import { getUserChatContext } from '@/domains/user'
import { generateChatStream, getUserMemories, saveUserMessage, saveAssistantMessage, updateSessionActivity, incrementDailyFreeUsage, detectCrisisKeywords, CRISIS_RESPONSE, ERROR_MESSAGES, extractAndSaveMemories, extractAndUpdateTopic } from '@/domains/chat'
import { MAX_DAILY_FREE, MAX_DAILY_FREE_GUEST } from '@/domains/chat/constants'
import { generateEmbedding, matchKnowledge } from '@/domains/knowledge'
import { deductCredit, getCreditBalance } from '@/domains/credit'
import { CREDIT_CONSTANTS } from '@/domains/credit/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        const { messages, mentorId, sessionId, guestMessageCount, inputMethod, visitorId } = await req.json()
        const lastUserMessage = messages[messages.length - 1]?.content || ''

        // 📊 분석 데이터 수집 (헤더에서 추출)
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || ''
        const ua = req.headers.get('user-agent') || ''
        const country = req.headers.get('x-vercel-ip-country') || ''
        const city = req.headers.get('x-vercel-ip-city') || ''
        const analytics = {
            ip_address: ip.slice(0, 45),
            device_type: parseDeviceType(ua),
            os: parseOS(ua),
            browser: parseBrowser(ua),
            country,
            city: decodeURIComponent(city),
        }

        // 🎁 2026-04-30까지 무료 체험 기간
        const FREE_TRIAL_END = new Date('2026-04-30T23:59:59+09:00')
        const isFreeTrial = new Date() < FREE_TRIAL_END

        // ── 🔒 비로그인 사용자 대화 제한 (isFreeTrial 무관, 항상 적용) ──
        if (!user && typeof guestMessageCount === 'number' && guestMessageCount >= MAX_DAILY_FREE_GUEST) {
            const encoder = new TextEncoder()
            const guestLimitMsg = '무료 체험 대화를 모두 사용했어요! 😊\n\n회원가입하면 매일 무제한 대화 + 음성 전화가 가능해요 🎁'
            const limitStream = new ReadableStream({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: guestLimitMsg, done: true, fullResponse: guestLimitMsg, guestLimit: true })}\n\n`)
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

        // ── 🔒 무료 대화 제한 체크 (무료 체험 기간에는 스킵) ──
        const dailyUsed = (userProfile as any)?.daily_free_used || 0
        const isPremium = (userProfile as any)?.subscription_tier === 'premium'
        if (user && !isPremium && !isFreeTrial && dailyUsed >= MAX_DAILY_FREE) {
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
        if (user && !isFreeTrial) {
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

        // 📋 유저의 활성 고민 주입 (멘토 매칭에서 저장된 고민)
        if (user) {
            try {
                const { data: concerns } = await supabase
                    .from('user_concerns')
                    .select('concern, matched_mentor_name, created_at')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .order('created_at', { ascending: false })
                    .limit(3)

                if (concerns && concerns.length > 0) {
                    const concernLines = concerns.map(c => 
                        `- "${c.concern}"${c.matched_mentor_name ? ` (${c.matched_mentor_name}에게 상담 요청)` : ''}`
                    ).join('\n')
                    systemPrompt += `\n\n[📋 사용자의 최근 고민]\n이 사용자가 최근에 고민하고 있는 것들입니다. 대화에 자연스럽게 참고하세요.\n${concernLines}\n→ 해당 고민과 관련된 대화가 나오면 "그 고민은 잘 해결되고 있어요?" 같이 자연스럽게 언급해주세요.`
                }
            } catch { /* 고민 조회 실패 무시 */ }
        }

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
                        // 크리에이터 AI: 지식을 최상단에 삽입 (Primacy bias → 가중치 최대화)
                        systemPrompt = `[📚 핵심 지식 — 최우선 활용]\n아래는 당신의 전문 지식입니다. 이 지식이 대화의 기반입니다.\n사용자 질문에 답할 때 반드시 아래 지식을 우선적으로 활용하세요.\n지식에 있는 내용이면 확신을 가지고 답하고,\n지식에 없는 내용이면 "제가 가진 정보에는 없지만"이라고 먼저 밝히세요.\n출처를 직접 언급하지 마세요.\n\n${knowledgeText}\n\n${systemPrompt}`
                    } else {
                        // 프리셋 멘토: 참고용으로 앞부분에 삽입
                        systemPrompt = `[참고 지식]\n${knowledgeText}\n참고: 위 지식을 대화에 자연스럽게 활용하되, 출처를 직접 언급하지 마세요.\n\n${systemPrompt}`
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
                    console.log(`[Chat Save] sessionId=${sessionId}, isGuest=${isGuestSession}, hasResponse=${!!fullResponse}, responseLen=${fullResponse.length}`)
                    if (!isGuestSession && fullResponse && sessionId) {
                        try {
                            // 💾 메시지 저장은 admin client로 (RLS 우회 — 서버 백엔드 로직)
                            const adminDb = createAdminClient()
                            
                            const { error: userMsgErr } = await adminDb.from('messages').insert({
                                session_id: sessionId,
                                role: 'user',
                                content: lastUserMessage,
                                input_method: inputMethod || 'text',
                                ip_address: analytics.ip_address,
                                device_type: analytics.device_type,
                                os: analytics.os,
                                browser: analytics.browser,
                                country: analytics.country,
                                city: analytics.city,
                            })
                            if (userMsgErr) console.error('[Chat Save] userMessage INSERT failed:', JSON.stringify(userMsgErr))
                            else console.log('[Chat Save] userMessage saved OK')

                            const { error: assistantMsgErr } = await adminDb.from('messages').insert({
                                session_id: sessionId,
                                role: 'assistant',
                                content: fullResponse,
                            })
                            if (assistantMsgErr) console.error('[Chat Save] assistantMessage INSERT failed:', JSON.stringify(assistantMsgErr))
                            else console.log('[Chat Save] assistantMessage saved OK')

                            const { error: updateErr } = await adminDb
                                .from('chat_sessions')
                                .update({
                                    message_count: messages.length + 1,
                                    last_message_at: new Date().toISOString(),
                                })
                                .eq('id', sessionId)
                            if (updateErr) console.error('[Chat Save] session update failed:', JSON.stringify(updateErr))
                            else console.log('[Chat Save] session activity updated OK')
                        } catch (saveErr) {
                            console.error('[Chat Save] CRITICAL save error:', saveErr instanceof Error ? saveErr.message : saveErr)
                        }

                        if (user) {
                            const dailyUsed = (userProfile as any)?.daily_free_used || 0
                            await incrementDailyFreeUsage(supabase, user.id, dailyUsed)

                            // 💰 크레딧 차감 (무료 체험 기간에는 스킵)
                            if (!isFreeTrial) {
                                deductCredit({
                                    user_id: user.id,
                                    amount: CREDIT_CONSTANTS.CHAT_COST_PER_MESSAGE,
                                    mentor_id: mentorId,
                                    description: `대화 차감 (${mentor.name})`,
                                }).catch(err => console.error('[Chat] Credit deduction failed:', err))
                            }

                            // 🧠 메모리 추출 (fire-and-forget, 응답 속도에 영향 없음)
                            extractAndSaveMemories(supabase, user.id, mentorId, lastUserMessage, fullResponse)
                                .catch(err => console.error('[Chat] Memory extraction failed:', err))

                            // 📝 주제 자동 추출 (fire-and-forget, 2/4/8턴마다)
                            extractAndUpdateTopic(supabase, sessionId, messages.length + 1)
                                .catch(err => console.error('[Chat] Topic extraction failed:', err))
                        }
                    }

                    // 📊 비회원 대화 로깅 (게스트 세션일 때 DB에 기록)
                    if (isGuestSession && fullResponse) {
                        try {
                            const adminDb = createAdminClient()
                            await adminDb.from('guest_chat_logs').insert({
                                mentor_id: mentorId,
                                mentor_name: mentor.name,
                                user_message: lastUserMessage.slice(0, 500),
                                ai_response: fullResponse.slice(0, 500),
                                message_index: guestMessageCount || messages.length,
                                ip_address: analytics.ip_address,
                                device_type: analytics.device_type,
                                os: analytics.os,
                                browser: analytics.browser,
                                country: analytics.country,
                                city: analytics.city,
                                visitor_id: visitorId || null,
                            })
                        } catch (guestLogErr) {
                            console.error('[Guest Log] Save failed:', guestLogErr instanceof Error ? guestLogErr.message : guestLogErr)
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

// ── 📊 User-Agent 파싱 헬퍼 ──
function parseDeviceType(ua: string): string {
    if (/iPad|tablet/i.test(ua)) return '태블릿'
    if (/Mobile|Android.*Mobile|iPhone|iPod/i.test(ua)) return '모바일'
    return '데스크톱'
}

function parseOS(ua: string): string {
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
    if (/Android/i.test(ua)) return 'Android'
    if (/Mac OS X/i.test(ua)) return 'macOS'
    if (/Windows/i.test(ua)) return 'Windows'
    if (/Linux/i.test(ua)) return 'Linux'
    return '기타'
}

function parseBrowser(ua: string): string {
    if (/Whale/i.test(ua)) return 'Whale'
    if (/SamsungBrowser/i.test(ua)) return 'Samsung'
    if (/Edg/i.test(ua)) return 'Edge'
    if (/OPR|Opera/i.test(ua)) return 'Opera'
    if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome'
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'Safari'
    if (/Firefox/i.test(ua)) return 'Firefox'
    return '기타'
}
