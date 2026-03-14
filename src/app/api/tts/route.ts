'use server'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Replicate from 'replicate'

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
})

// 멘토별 기본 음성 디자인 프롬프트 — 🇰🇷 한국어 톤 특화
const MENTOR_VOICE_DESIGNS: Record<string, string> = {
    '열정진': 'An energetic Korean male voice in his 30s. Speaks with passionate conviction and warmth, like motivating a close friend. Natural Korean speech rhythm with rising intonation for emphasis. Uses casual-formal hybrid tone (해요체). Slight breathiness when excited.',
    '글담쌤': 'A calm, warm Korean female voice in her 40s. Speaks gently like a nurturing teacher, with soft pauses between thoughts. Slow, deliberate pacing with clear articulation. Uses polite formal Korean (하세요체). Has a soothing, melodic quality.',
    'Cathy': 'A bright, confident bilingual female voice. Professional and cheerful English native speaker tone with natural Korean pronunciation when mixing languages. Speaks with upbeat energy and clear enunciation. Uses friendly professional tone.',
    '봉이 김선달': 'A witty, theatrical Korean male voice with a mischievous undertone. Speaks with dramatic pauses and playful intonation, like a traditional Korean storyteller. Uses archaic-modern mix (하오체/해요체). Animated and charismatic delivery.',
    '신사임당': 'An elegant, composed Korean female voice with quiet authority. Speaks with measured grace and intellectual depth. Deliberate pacing with thoughtful pauses. Uses dignified formal Korean (합니다체). Warm but commanding presence.',
}

const DEFAULT_VOICE_DESIGN = 'A friendly, natural Korean voice. Clear warm conversational tone with natural Korean speech rhythm and polite delivery.'

// 😊 감정별 보이스 수정자
const EMOTION_MODIFIERS: Record<string, string> = {
    comfort: 'Speak in a deeply warm, comforting, and gentle tone, as if consoling someone.',
    excited: 'Speak with high energy and enthusiasm, conveying excitement and passion.',
    serious: 'Speak in a calm, serious, and authoritative tone with measured pacing.',
    cheerful: 'Speak in a bright, upbeat, and cheerful manner with a smile in the voice.',
    empathetic: 'Speak with deep empathy and understanding, using a soft and caring tone.',
    encouraging: 'Speak in an inspiring and encouraging way, boosting confidence and motivation.',
}

// 🌏 텍스트 기반 언어 자동 감지
function detectLanguage(text: string): string {
    const koreanChars = (text.match(/[\uAC00-\uD7AF\u3130-\u318F]/g) || []).length
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length
    const totalChars = koreanChars + englishChars

    if (totalChars === 0) return 'Korean'
    // 영어 비율이 60% 이상이면 영어
    return englishChars / totalChars > 0.6 ? 'English' : 'Korean'
}

// 😊 텍스트에서 감정 자동 분석
function detectEmotion(text: string): string | null {
    const comfortWords = ['괜찮', '힘들', '걱정', '위로', '고생', '힘내', '슬프', '아프', '울']
    const excitedWords = ['축하', '대박', '와', '멋져', '최고', '좋아', '신나', '짱', '성공']
    const seriousWords = ['중요', '심각', '문제', '위험', '주의', '경고', '반드시']
    const encouragingWords = ['할 수 있', '화이팅', '응원', '믿', '도전', '성장', '노력', '포기']

    const lower = text.toLowerCase()
    const counts: Record<string, number> = { comfort: 0, excited: 0, serious: 0, encouraging: 0 }

    comfortWords.forEach(w => { if (lower.includes(w)) counts.comfort++ })
    excitedWords.forEach(w => { if (lower.includes(w)) counts.excited++ })
    seriousWords.forEach(w => { if (lower.includes(w)) counts.serious++ })
    encouragingWords.forEach(w => { if (lower.includes(w)) counts.encouraging++ })

    const max = Math.max(...Object.values(counts))
    if (max === 0) return null

    return Object.entries(counts).find(([, v]) => v === max)?.[0] || null
}

export async function POST(request: NextRequest) {
    try {
        // 인증 확인
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { text, mentorName, language, voiceSampleUrl, emotion } = await request.json()

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 })
        }

        // 텍스트 길이 제한 (500자)
        const trimmedText = text.slice(0, 500)

        // 🌏 언어 자동 감지 — 명시적으로 지정되지 않으면 텍스트 분석
        const lang = language || detectLanguage(trimmedText)

        // 😊 감정 분석 — 명시적 감정이 없으면 자동 감지
        const detectedEmotion = emotion || detectEmotion(trimmedText)

        // 멘토별 Voice Design 프롬프트 + 감정 반영
        let voiceDesign = MENTOR_VOICE_DESIGNS[mentorName || ''] || DEFAULT_VOICE_DESIGN
        if (detectedEmotion && EMOTION_MODIFIERS[detectedEmotion]) {
            voiceDesign += ' ' + EMOTION_MODIFIERS[detectedEmotion]
        }

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
            // 🎨 Voice Design 모드 — 텍스트 설명으로 음성 생성 (감정 반영)
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

        return NextResponse.json({ audioUrl, detectedEmotion, detectedLanguage: lang })
    } catch (error: any) {
        console.error('[TTS API Error]', error)
        return NextResponse.json(
            { error: error?.message || '음성 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}

