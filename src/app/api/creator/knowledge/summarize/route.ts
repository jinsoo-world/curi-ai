// /api/creator/knowledge/summarize — Gemini로 파일 내용 요약 생성
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'

const GEMINI_MODEL = 'gemini-2.0-flash'

export async function POST(request: Request) {
    try {
        const supabase = await createServerClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

        const { sourceId, content } = await request.json()
        if (!sourceId || !content) {
            return NextResponse.json({ error: 'sourceId, content 필요' }, { status: 400 })
        }

        // 이미 요약이 있는지 확인
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const { data: existing } = await admin
            .from('knowledge_sources')
            .select('summary')
            .eq('id', sourceId)
            .single()

        if (existing?.summary) {
            return NextResponse.json({ summary: existing.summary })
        }

        // Gemini로 요약 생성
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

        const truncatedContent = content.slice(0, 8000) // 토큰 절약

        const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{
                role: 'user',
                parts: [{ text: `다음 문서를 분석해서 아래 형식으로 요약해주세요. 반드시 한국어로 작성하세요.

형식:
📌 문서 유형: (예: 사업 소개서, 교육 자료, 기술 문서, FAQ 등)
📝 핵심 내용: (3줄 이내로 문서의 핵심을 요약)
🏷️ 주요 키워드: (쉼표로 구분, 최대 5개)
💡 AI 학습 포인트: (이 문서에서 AI가 배울 수 있는 핵심 지식 1-2줄)

문서 내용:
${truncatedContent}` }],
            }],
        })

        const summary = response?.candidates?.[0]?.content?.parts?.[0]?.text || ''

        if (!summary) {
            return NextResponse.json({ error: '요약 생성에 실패했습니다.' }, { status: 500 })
        }

        // DB에 요약 캐싱
        await admin
            .from('knowledge_sources')
            .update({ summary })
            .eq('id', sourceId)

        return NextResponse.json({ summary })
    } catch (err) {
        console.error('[Summarize] Error:', err)
        return NextResponse.json({ error: '요약 생성 중 오류가 발생했습니다.' }, { status: 500 })
    }
}
