// /api/chat/export-ebook — 전자책 원고 조립 API
// 전체 대화를 기반으로 구조화된 JSON 원고를 생성
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // 원고 생성은 시간이 더 걸릴 수 있음

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

const EBOOK_SYSTEM_PROMPT = `당신은 대화 내용을 분석하여 구조화된 전자책 원고 JSON을 생성하는 전문가입니다.

대화에서 유저와 AI가 나눈 전자책 관련 논의를 모두 종합하여, 아래 JSON 형식으로 최종 원고를 조립하세요.
대화 중 수정 요청이 있었다면, 가장 마지막 수정 사항을 반영한 최종 버전을 출력하세요.

반드시 아래 JSON만 출력하세요. 마크다운이나 코드블록 없이 순수 JSON만 출력하세요.

{
  "cover": {
    "title": "전자책 메인 제목",
    "subtitle": "매력적인 부제목",
    "author": "강사 이름 (대화에서 파악, 없으면 빈 문자열)",
    "imageGuide": "표지 이미지 추천 설명"
  },
  "pages": [
    {
      "pageNum": 1,
      "title": "페이지 제목",
      "imageGuide": "이 페이지에 어울리는 이미지 추천 설명",
      "content": "본문 내용 (최소 500자, 2문장마다 줄바꿈)"
    },
    {
      "pageNum": 2,
      "title": "페이지 제목",
      "imageGuide": "이미지 추천 설명",
      "content": "본문 내용",
      "quote": "강사의 한 마디 (있을 경우만)"
    },
    {
      "pageNum": 3,
      "title": "페이지 제목",
      "imageGuide": "이미지 추천 설명",
      "content": "본문 내용"
    },
    {
      "pageNum": 4,
      "title": "페이지 제목",
      "imageGuide": "이미지 추천 설명",
      "content": "본문 내용"
    },
    {
      "pageNum": 5,
      "title": "페이지 제목",
      "imageGuide": "이미지 추천 설명",
      "content": "본문 내용",
      "cta": "행동 유도 문구",
      "checklist": ["구체적 행동 1", "구체적 행동 2"]
    }
  ]
}

규칙:
- 전자책은 반드시 저자(멘토) 본인의 1인칭 시점으로 작성하세요. "나는", "저는", "제가" 등 저자가 독자에게 직접 이야기하는 톤입니다.
- 저자 이름에 "님"을 붙이지 마세요. 저자 본인이 쓴 글이므로 "열정진님이"가 아니라 "내가", "제가"로 작성합니다.
- 독자를 "당신", "여러분" 등 2인칭으로 호칭하세요.
- 페이지 제목(title)은 기획서/교안 스타일이 아닌, 독자가 읽고 싶어지는 콘텐츠형 제목으로 작성하세요. 예: "강사 소개 및 권위 확보" (X) → "왜 나만 믿으면 되는지, 그 이유" (O), "도입부: 문제 인식" (X) → "왜 내 강의는 안 팔릴까?" (O)
- 대화에서 수집된 정보를 정확히 반영하세요.
- 수집되지 않은 정보는 "[여기에 입력해 주세요]" 형태의 빈칸으로 남기세요. 절대 지어내지 마세요.
- 각 페이지 content는 최소 500자 이상의 풍부한 서술형 문장으로 작성하세요.
- content 안에서 2문장마다 빈 줄(\\n\\n)을 넣어 가독성을 확보하세요.
- 볼드(**), 해시(#), 별표(*) 등 마크다운 기호를 절대 사용하지 마세요.
- 대화 중 유저가 수정을 요청했다면, 최종 수정 내용을 반영한 버전을 출력하세요.`

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

        // 사용자 닉네임 조회 (저자명으로 사용)
        const { data: profile } = await admin
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single()

        const authorName = profile?.display_name || user.user_metadata?.name || user.email?.split('@')[0] || '저자'

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
            .map(m => `[${m.role === 'user' ? '유저' : 'AI'}] ${m.content}`)
            .join('\n\n')

        // Gemini로 구조화된 원고 JSON 생성
        const ai = getAI()
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: EBOOK_SYSTEM_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 8192,
                thinkingConfig: { thinkingBudget: 0 },
            },
            contents: [{
                role: 'user',
                parts: [{ text: `다음 대화를 분석하여 전자책 원고를 JSON으로 조립해 주세요. 저자명은 "${authorName}"으로 설정하세요:\n\n${conversationText}` }],
            }],
        })

        // JSON 파싱
        let ebookData
        const responseText = result.text || ''
        try {
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText]
            ebookData = JSON.parse(jsonMatch[1]!.trim())
        } catch {
            return Response.json({ error: '원고 생성에 실패했습니다. 다시 시도해 주세요.' }, { status: 500 })
        }

        // 저자명을 ebook 데이터에 강제 설정 (사용자 닉네임)
        if (ebookData.cover) {
            ebookData.cover.author = authorName
        }

        const mentorName = mentor?.persona_name || mentor?.name || 'AI 멘토'

        return Response.json({
            ebook: ebookData,
            meta: {
                mentorName,
                createdDate: new Date().toLocaleDateString('ko-KR', {
                    year: 'numeric', month: 'long', day: 'numeric',
                }),
                sessionTitle: session.title,
            }
        })

    } catch (error) {
        console.error('[EBOOK EXPORT ERROR]', error)
        return Response.json(
            { error: '원고 생성 중 오류가 발생했습니다' },
            { status: 500 },
        )
    }
}
