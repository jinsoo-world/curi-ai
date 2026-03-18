// /api/chat/export — AI 요약 리포트 생성 API
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

const EXPORT_SYSTEM_PROMPT = `당신은 AI 멘토와 유저의 대화를 분석하여 구조화된 리포트를 만드는 전문가입니다.

대화 내용을 읽고 아래 JSON 형식으로 정확히 응답하세요. 마크다운이나 코드블록 없이 순수 JSON만 출력하세요.

{
  "title": "대화 주제를 요약한 제목 (한 줄)",
  "summary": "전체 대화를 2~3문장으로 요약",
  "keyDecisions": ["대화 중 확정된 결정 사항들 (배열)"],
  "insights": ["AI가 제공한 핵심 인사이트/조언들 (배열)"],
  "actionItems": ["유저가 다음에 해야 할 구체적인 할 일들 (배열)"],
  "outline": "대화에서 만들어진 목차/구조가 있다면 마크다운 형식으로, 없으면 null"
}

규칙:
- 인사말, 감정표현 등 대화 접착제는 무시하고 핵심 정보만 추출
- keyDecisions는 유저가 명시적으로 선택/확정한 사항만
- actionItems는 실행 가능하고 구체적인 것만
- 대화에 해당 항목이 없으면 빈 배열 []로
- outline은 목차, 구조, 계획 등이 대화에서 존재할 때만`

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: '로그인이 필요합니다' }, { status: 401 })
        }

        const { sessionId } = await req.json()

        if (!sessionId) {
            return Response.json({ error: '세션 ID가 필요합니다' }, { status: 400 })
        }

        const admin = createAdminClient()

        // 세션 정보 조회
        const { data: session } = await admin
            .from('chat_sessions')
            .select('id, mentor_id, created_at, title')
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .single()

        if (!session) {
            return Response.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
        }

        // 멘토 정보
        const { data: mentor } = await admin
            .from('mentors')
            .select('name, persona_name')
            .eq('id', session.mentor_id)
            .single()

        // 메시지 조회
        const { data: messages } = await admin
            .from('messages')
            .select('role, content, created_at')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })

        if (!messages || messages.length === 0) {
            return Response.json({ error: '메시지가 없습니다' }, { status: 404 })
        }

        // 대화 텍스트 조합
        const conversationText = messages
            .map(m => `[${m.role === 'user' ? '유저' : 'AI멘토'}] ${m.content}`)
            .join('\n\n')

        // Gemini로 요약 생성
        const ai = getAI()
        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: EXPORT_SYSTEM_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 2048,
                thinkingConfig: { thinkingBudget: 0 },
            },
            contents: [{
                role: 'user',
                parts: [{ text: `다음 대화를 분석해주세요:\n\n${conversationText}` }],
            }],
        })

        // JSON 파싱
        let reportData
        const responseText = result.text || ''
        try {
            // JSON 코드블록이 있으면 추출
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText]
            reportData = JSON.parse(jsonMatch[1]!.trim())
        } catch {
            reportData = {
                title: session.title || '대화 리포트',
                summary: '요약을 생성할 수 없었습니다.',
                keyDecisions: [],
                insights: [],
                actionItems: [],
                outline: null,
            }
        }

        // 마크다운 리포트 생성
        const mentorName = mentor?.persona_name || mentor?.name || 'AI 멘토'
        const createdDate = new Date(session.created_at).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric',
        })
        const messageCount = messages.length
        const userMsgCount = messages.filter(m => m.role === 'user').length
        const aiMsgCount = messages.filter(m => m.role === 'assistant').length

        let markdown = `# 📋 ${reportData.title}\n\n`
        markdown += `> **${mentorName}** 멘토와의 대화 리포트  \n`
        markdown += `> 📅 ${createdDate} · 💬 총 ${messageCount}개 메시지 (유저 ${userMsgCount} / AI ${aiMsgCount})\n\n`
        markdown += `---\n\n`

        // 요약
        markdown += `## 📝 대화 요약\n\n${reportData.summary}\n\n`

        // 핵심 결정 사항
        if (reportData.keyDecisions?.length > 0) {
            markdown += `## 📌 핵심 결정 사항\n\n`
            reportData.keyDecisions.forEach((d: string) => {
                markdown += `- ✅ ${d}\n`
            })
            markdown += `\n`
        }

        // 인사이트
        if (reportData.insights?.length > 0) {
            markdown += `## 💡 주요 인사이트\n\n`
            reportData.insights.forEach((i: string) => {
                markdown += `- ${i}\n`
            })
            markdown += `\n`
        }

        // 할 일
        if (reportData.actionItems?.length > 0) {
            markdown += `## ✅ 다음 할 일\n\n`
            reportData.actionItems.forEach((a: string) => {
                markdown += `- [ ] ${a}\n`
            })
            markdown += `\n`
        }

        // 목차/구조
        if (reportData.outline) {
            markdown += `## 📚 확정된 구조/목차\n\n${reportData.outline}\n\n`
        }

        // 원문 대화 (접이식)
        markdown += `---\n\n`
        markdown += `<details>\n<summary>💬 원문 대화 보기 (${messageCount}개 메시지)</summary>\n\n`
        messages.forEach((m: { role: string; content: string; created_at: string }) => {
            const time = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            const role = m.role === 'user' ? '👤 유저' : `🤖 ${mentorName}`
            markdown += `**${role}** (${time})\n\n${m.content}\n\n---\n\n`
        })
        markdown += `</details>\n`

        return Response.json({
            report: reportData,
            markdown,
            meta: {
                mentorName,
                createdDate,
                messageCount,
                sessionTitle: session.title,
            }
        })

    } catch (error) {
        console.error('[EXPORT ERROR]', error)
        return Response.json(
            { error: '리포트 생성 중 오류가 발생했습니다' },
            { status: 500 },
        )
    }
}
