// /api/chat/edit-ebook — 전자책 인라인 수정 API
// 현재 ebook JSON + 수정 요청을 받아 수정된 ebook JSON을 반환
import { createClient } from '@/lib/supabase/server'
import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

const EDIT_SYSTEM_PROMPT = `당신은 전자책 원고 편집 전문가입니다. 사용자의 수정 요청에 따라 기존 전자책 JSON을 수정합니다.

중요 규칙:
- 전자책은 반드시 저자 본인의 1인칭 시점("나는", "저는", "제가")으로 작성하세요.
- 저자 이름에 "님"을 붙이지 마세요.
- 독자를 "당신", "여러분" 등 2인칭으로 호칭하세요.
- 수정 요청에 해당하는 부분만 수정하고, 나머지는 그대로 유지하세요.
- 각 페이지 content는 최소 500자 이상을 유지하세요.
- 볼드(**), 해시(#), 별표(*) 등 마크다운 기호를 절대 사용하지 마세요.
- 반드시 전체 JSON을 출력하세요. 마크다운이나 코드블록 없이 순수 JSON만 출력하세요.
- 수정 완료 후 JSON 끝에 "___SUMMARY___" 구분자와 함께 수정 내용을 요약(한 줄)하세요.

출력 형식:
{전체 ebook JSON}
___SUMMARY___
수정 요약 (한 줄)`

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: '로그인이 필요합니다' }, { status: 401 })
        }

        const { currentEbook, editRequest, mentorName } = await req.json()

        if (!currentEbook || !editRequest) {
            return Response.json({ error: '필수 파라미터가 없습니다' }, { status: 400 })
        }

        const ai = getAI()
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            config: {
                systemInstruction: EDIT_SYSTEM_PROMPT,
                temperature: 0.3,
                maxOutputTokens: 8192,
                thinkingConfig: { thinkingBudget: 0 },
            },
            contents: [{
                role: 'user',
                parts: [{ text: `현재 전자책 JSON:\n${JSON.stringify(currentEbook, null, 2)}\n\n저자(멘토) 이름: ${mentorName}\n\n수정 요청: ${editRequest}\n\n위 수정 요청을 반영한 전체 전자책 JSON을 출력하세요.` }],
            }],
        })

        const responseText = result.text || ''

        // JSON과 요약 분리
        let ebookData
        let summary = '✅ 수정 완료!'

        const parts = responseText.split('___SUMMARY___')
        const jsonPart = parts[0].trim()
        if (parts[1]) summary = parts[1].trim()

        try {
            const jsonMatch = jsonPart.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, jsonPart]
            ebookData = JSON.parse(jsonMatch[1]!.trim())
        } catch {
            return Response.json({ error: '수정 결과 파싱에 실패했습니다. 다시 시도해 주세요.' }, { status: 500 })
        }

        return Response.json({ ebook: ebookData, summary })

    } catch (error) {
        console.error('[EBOOK EDIT ERROR]', error)
        return Response.json(
            { error: '수정 중 오류가 발생했습니다' },
            { status: 500 },
        )
    }
}
