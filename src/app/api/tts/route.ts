'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Replicate from 'replicate'

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
})

// 멘토별 음성 디자인 프롬프트
const MENTOR_VOICE_DESIGNS: Record<string, string> = {
    '열정진': 'An energetic, enthusiastic Korean male voice in his 30s. Passionate and motivational tone with high energy.',
    '글담쌤': 'A calm, warm Korean female teacher voice in her 40s. Gentle and nurturing tone.',
    'Cathy': 'A bright, confident female voice. Professional and cheerful English native speaker tone.',
    '봉이 김선달': 'A witty, playful Korean male voice. Humorous and charming storyteller tone with theatrical flair.',
    '신사임당': 'An elegant, wise Korean female voice. Dignified and thoughtful tone with warmth and authority.',
}

const DEFAULT_VOICE_DESIGN = 'A friendly, natural Korean voice. Clear and warm conversational tone.'

export async function POST(request: NextRequest) {
    try {
        // 인증 확인
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { text, mentorName, language, voiceSampleUrl } = await request.json()

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 })
        }

        // 텍스트 길이 제한 (500자)
        const trimmedText = text.slice(0, 500)

        // 멘토별 Voice Design 프롬프트
        const voiceDesign = MENTOR_VOICE_DESIGNS[mentorName || ''] || DEFAULT_VOICE_DESIGN

        // 언어 감지 (기본: Korean)
        const lang = language || (mentorName === 'Cathy' ? 'English' : 'Korean')

        // Replicate Qwen3-TTS 호출 — 음성 샘플이 있으면 clone 모드
        let replicateInput: Record<string, any>

        if (voiceSampleUrl) {
            // 🎙️ Voice Clone 모드 — 업로드된 음성 샘플로 목소리 복제
            replicateInput = {
                text: trimmedText,
                mode: 'clone',
                voice_audio: voiceSampleUrl,
                language: lang,
            }
        } else {
            // 🎨 Voice Design 모드 — 텍스트 설명으로 음성 생성
            replicateInput = {
                text: trimmedText,
                mode: 'voice_design',
                voice_design_text: voiceDesign,
                language: lang,
            }
        }

        const output = await replicate.run('qwen/qwen3-tts', {
            input: replicateInput,
        })

        // output은 보통 URL string 또는 ReadableStream
        let audioUrl: string

        if (typeof output === 'string') {
            audioUrl = output
        } else if (output && typeof output === 'object' && 'url' in (output as any)) {
            audioUrl = (output as any).url
        } else if (Array.isArray(output) && output.length > 0) {
            audioUrl = typeof output[0] === 'string' ? output[0] : (output[0] as any)?.url || ''
        } else {
            // FileOutput인 경우 toString()
            audioUrl = String(output)
        }

        if (!audioUrl) {
            return NextResponse.json({ error: '음성 생성에 실패했습니다.' }, { status: 500 })
        }

        return NextResponse.json({ audioUrl })
    } catch (error: any) {
        console.error('[TTS API Error]', error)
        return NextResponse.json(
            { error: error?.message || '음성 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
