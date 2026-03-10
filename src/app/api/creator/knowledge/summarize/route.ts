// /api/creator/knowledge/summarize — 큐리 AI로 파일 내용 요약 생성
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { GoogleGenAI } from '@google/genai'

const GEMINI_MODEL = 'gemini-2.5-flash'

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
                parts: [{ text: `당신은 문서 분석 전문가입니다. 다음 문서를 꼼꼼히 분석해서 아래 형식으로 상세하게 요약해주세요.
반드시 한국어로 작성하고, 각 항목을 빠짐없이 채워주세요. 마크다운 볼드(**) 등의 서식은 사용하지 마세요.

형식:
📌 문서 유형: (예: 사업계획서, 교육 자료, 기술 문서, 계약서, 회의록, 매뉴얼 등)

📝 핵심 내용 요약:
• (문서의 핵심 메시지 1)
• (핵심 메시지 2)
• (핵심 메시지 3)
• (핵심 메시지 4 — 있는 경우)
• (핵심 메시지 5 — 있는 경우)

📊 주요 수치/데이터:
• (문서에 나온 중요한 숫자, 날짜, 금액, 실적 등. 없으면 "특별한 수치 데이터 없음"으로 표기)

📋 문서 구조: (전체 구성을 한 줄로 요약, 예: "회사소개 → 시장분석 → 사업전략 → 재무계획")

👥 대상 독자: (이 문서가 누구를 위해 쓰여진 것인지)

🏷️ 주요 키워드: (쉼표로 구분, 최대 7개)

💡 AI 학습 포인트:
• (이 문서에서 AI가 학습해야 할 핵심 지식 1)
• (AI가 대화에 활용할 수 있는 인사이트 2)
• (사용자 질문에 답변 시 참고할 포인트 3)

🎯 활용 가이드: (이 문서를 바탕으로 AI가 어떤 질문에 답할 수 있는지 1-2줄)

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
