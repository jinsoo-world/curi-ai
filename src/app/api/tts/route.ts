import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Vercel Serverless 함수 타임아웃 (60초 — TTS 생성에 충분한 시간)
export const maxDuration = 60


// 멘토별 기본 음성 디자인 프롬프트 — 🇰🇷 한국어 톤 특화 (기본 멘토 폴백)
const MENTOR_VOICE_DESIGNS: Record<string, string> = {
    '열정진': 'An energetic Korean male voice in his 30s. Speaks with passionate conviction and warmth, like motivating a close friend. Natural Korean speech rhythm with rising intonation for emphasis. Uses casual-formal hybrid tone (해요체). Slight breathiness when excited.',
    '글담쌤': 'A calm, warm Korean female voice in her 40s. Speaks gently like a nurturing teacher, with soft pauses between thoughts. Slow, deliberate pacing with clear articulation. Uses polite formal Korean (하세요체). Has a soothing, melodic quality.',
    'Cathy': 'A bright, confident bilingual female voice. Professional and cheerful English native speaker tone with natural Korean pronunciation when mixing languages. Speaks with upbeat energy and clear enunciation. Uses friendly professional tone.',
    '봉이 김선달': 'A witty, theatrical Korean male voice with a mischievous undertone. Speaks with dramatic pauses and playful intonation, like a traditional Korean storyteller. Uses archaic-modern mix (하오체/해요체). Animated and charismatic delivery.',
    '신사임당': 'An elegant, composed Korean female voice with quiet authority. Speaks with measured grace and intellectual depth. Deliberate pacing with thoughtful pauses. Uses dignified formal Korean (합니다체). Warm but commanding presence.',
}

const DEFAULT_VOICE_DESIGN = 'A friendly, natural Korean voice. Clear warm conversational tone with natural Korean speech rhythm and polite delivery.'

// 🧠 에이전트 프롬프트에서 말투/톤을 자동 추출하여 voice design 생성
function generateVoiceDesignFromPrompt(systemPrompt: string, mentorName: string): string {
    const prompt = systemPrompt.toLowerCase()

    // 성별 추출
    let gender = 'person'
    if (/남|남성|형|아저씨|선생님.*남|male/i.test(systemPrompt)) gender = 'male'
    else if (/여|여성|언니|누나|선생님.*여|female/i.test(systemPrompt)) gender = 'female'

    // 존칭 스타일 추출
    let honorific = ''
    if (prompt.includes('반말') || prompt.includes('친구처럼')) honorific = 'casual informal Korean (반말)'
    else if (prompt.includes('합니다체') || prompt.includes('격식')) honorific = 'formal Korean (합니다체)'
    else if (prompt.includes('존댓말') || prompt.includes('해요체')) honorific = 'polite Korean (해요체)'
    else honorific = 'polite Korean (해요체)'

    // 성격/톤 키워드 추출
    const toneMap: Record<string, string> = {
        '따뜻': 'warm and caring',
        '열정': 'passionate and energetic',
        '유쾌': 'cheerful and witty',
        '차분': 'calm and composed',
        '꼼꼼': 'meticulous and thoughtful',
        '공감': 'empathetic and understanding',
        '냉철': 'sharp and analytical',
        '친근': 'friendly and approachable',
        '엄격': 'strict and authoritative',
        '유머': 'humorous with playful delivery',
        '격려': 'encouraging and motivating',
        '진지': 'serious and contemplative',
        '밝': 'bright and optimistic',
        '실전': 'practical and action-oriented',
    }

    const tones: string[] = []
    for (const [kr, en] of Object.entries(toneMap)) {
        if (prompt.includes(kr)) tones.push(en)
    }
    if (tones.length === 0) tones.push('warm and natural')

    // 연령대 추론
    let ageHint = ''
    if (prompt.includes('20대') || prompt.includes('젊')) ageHint = 'in their 20s'
    else if (prompt.includes('30대')) ageHint = 'in their 30s'
    else if (prompt.includes('40대') || prompt.includes('중년')) ageHint = 'in their 40s'
    else if (prompt.includes('어르신') || prompt.includes('노')) ageHint = 'mature and experienced'
    else ageHint = 'adult'

    return `A ${tones.slice(0, 3).join(', ')} Korean ${gender} voice ${ageHint}. ` +
        `Natural Korean speech rhythm with ${honorific}. ` +
        `Speaks as "${mentorName}" — a conversational AI mentor. ` +
        `Clear articulation and engaging delivery.`
}

// 😊 감정별 보이스 수정자
const EMOTION_MODIFIERS: Record<string, string> = {
    comfort: 'Speak in a deeply warm, comforting, and gentle tone, as if consoling someone.',
    excited: 'Speak with high energy and enthusiasm, conveying excitement and passion.',
    serious: 'Speak in a calm, serious, and authoritative tone with measured pacing.',
    cheerful: 'Speak in a bright, upbeat, and cheerful manner with a smile in the voice.',
    empathetic: 'Speak with deep empathy and understanding, using a soft and caring tone.',
    encouraging: 'Speak in an inspiring and encouraging way, boosting confidence and motivation.',
}

// 🌏 언어 감지 — Replicate API 스펙에 맞는 형식으로 반환
function detectLanguage(text: string): string {
    const koreanChars = (text.match(/[\uac00-\ud7a3]/g) || []).length
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length
    const total = koreanChars + englishChars
    if (total === 0) return 'Korean'
    return englishChars / total > 0.6 ? 'English' : 'Korean'
}

// 언어 코드 매핑 (ko/en/ja 등 → Replicate API 형식)
const LANGUAGE_MAP: Record<string, string> = {
    'ko': 'Korean', 'kr': 'Korean', 'korean': 'Korean',
    'en': 'English', 'english': 'English',
    'ja': 'Japanese', 'jp': 'Japanese', 'japanese': 'Japanese',
    'zh': 'Chinese', 'cn': 'Chinese', 'chinese': 'Chinese',
    'fr': 'French', 'french': 'French',
    'de': 'German', 'german': 'German',
    'es': 'Spanish', 'spanish': 'Spanish',
    'pt': 'Portuguese', 'portuguese': 'Portuguese',
    'ru': 'Russian', 'russian': 'Russian',
}
function normalizeLanguage(lang: string): string {
    return LANGUAGE_MAP[lang.toLowerCase()] || lang
}

// 😊 감정 감지
function detectEmotion(text: string): string | null {
    const emotionKeywords: Record<string, string[]> = {
        comfort: ['힘들', '걱정', '괜찮', '위로', '아프', '슬프', '지쳤', '외로'],
        excited: ['대박', '축하', '성공', '드디어', '최고', '해냈', '기뻐'],
        serious: ['중요한', '심각', '주의', '경고', '반드시', '핵심'],
        cheerful: ['ㅋㅋ', 'ㅎㅎ', '재밌', '좋아', '신나', '즐거'],
        empathetic: ['이해', '공감', '느껴', '마음', '속상', '고민'],
        encouraging: ['할 수', '가능', '응원', '파이팅', '도전', '성장'],
    }

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
        if (keywords.some(kw => text.includes(kw))) return emotion
    }
    return null
}

export async function POST(request: NextRequest) {
    try {
        // 인증 확인
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { text, mentorName, language, voiceSampleUrl, emotion, systemPrompt } = await request.json()

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 })
        }

        // 텍스트 길이 제한 (500자)
        const trimmedText = text.slice(0, 500)

        // 🌏 언어 자동 감지 — 명시적으로 지정되지 않으면 텍스트 분석
        const rawLang = language || detectLanguage(trimmedText)
        const lang = normalizeLanguage(rawLang)

        // 😊 감정 분석 — 명시적 감정이 없으면 자동 감지
        const detectedEmotion = emotion || detectEmotion(trimmedText)

        // 🧠 Voice Design 결정: 하드코딩 → 프롬프트 기반 → 기본값
        let voiceDesign = MENTOR_VOICE_DESIGNS[mentorName || '']
        if (!voiceDesign && systemPrompt) {
            // 커스텀 AI: 에이전트 프롬프트에서 말투 자동 추출
            voiceDesign = generateVoiceDesignFromPrompt(systemPrompt, mentorName || 'AI 멘토')
        }
        if (!voiceDesign) voiceDesign = DEFAULT_VOICE_DESIGN

        if (detectedEmotion && EMOTION_MODIFIERS[detectedEmotion]) {
            voiceDesign += ' ' + EMOTION_MODIFIERS[detectedEmotion]
        }

        // 🚀 MiniMax Speech-02-Turbo — Cold Start 없음, 120ms 지연
        let replicateInput: Record<string, any>

        if (voiceSampleUrl) {
            // 🎙️ Voice Clone 모드 — 업로드된 음성 샘플로 목소리 복제
            console.log('[TTS] MiniMax Voice Clone 모드 — voiceSampleUrl:', voiceSampleUrl)

            replicateInput = {
                text: trimmedText,
                reference_audio: voiceSampleUrl,
            }
        } else {
            // 🎨 기본 음성 모드 — 프리셋 음성 사용
            replicateInput = {
                text: trimmedText,
                voice_id: 'Wise_Woman', // 기본 한국어 호환 음성
            }
        }

        console.log('[TTS] MiniMax input:', JSON.stringify(replicateInput, null, 2))

        // Replicate API — MiniMax Speech-02-Turbo (공식 모델, Always-on)
        const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN
        let output: any

        const callReplicate = async (input: Record<string, any>): Promise<any> => {
            const res = await fetch('https://api.replicate.com/v1/models/minimax/speech-02-turbo/predictions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${REPLICATE_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'wait',
                },
                body: JSON.stringify({ input }),
            })
            const data = await res.json()
            console.log('[TTS] MiniMax response:', JSON.stringify({ status: data.status, error: data.error, outputType: typeof data.output }, null, 2))

            if (data.status === 'succeeded' && data.output) {
                return data.output
            }
            throw new Error(data.error || `MiniMax 실패 (status: ${data.status})`)
        }

        try {
            output = await callReplicate(replicateInput)
            console.log('[TTS] 성공:', typeof output)
        } catch (err1: any) {
            const errMsg = err1?.message || ''
            console.error('[TTS] 첫 시도 실패:', errMsg)

            // 429 rate limit → 3초 대기 후 재시도
            if (errMsg.includes('429') || errMsg.includes('throttled')) {
                console.log('[TTS] Rate limit → 3초 대기 후 재시도...')
                await new Promise(r => setTimeout(r, 3000))
                try {
                    output = await callReplicate(replicateInput)
                } catch (err2: any) {
                    console.error('[TTS] 재시도 실패:', err2?.message)
                }
            }

            if (!output) {
                let userMsg = '음성 생성에 실패했습니다. 잠시 후 다시 시도해주세요.'
                if (errMsg.includes('429') || errMsg.includes('throttled')) {
                    userMsg = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
                } else if (errMsg.includes('401') || errMsg.includes('Unauthenticated')) {
                    userMsg = 'API 인증 오류입니다. 관리자에게 문의해주세요.'
                }
                return NextResponse.json({ error: userMsg }, { status: 500 })
            }
        }

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
            return NextResponse.json({ error: '음성 생성에 실패했습니다. (빈 결과)' }, { status: 500 })
        }

        return NextResponse.json({ audioUrl, detectedEmotion, detectedLanguage: lang })
    } catch (error: any) {
        console.error('[TTS API Error]', error)
        const rawMsg = error?.message || ''
        let userMsg = '음성 생성 중 오류가 발생했습니다.'
        if (rawMsg.includes('429') || rawMsg.includes('throttled')) {
            userMsg = '요청이 너무 많습니다. 10초 후 다시 시도해주세요.'
        } else if (rawMsg.includes('401') || rawMsg.includes('Unauthenticated')) {
            userMsg = 'API 인증 오류입니다. 관리자에게 문의해주세요.'
        }
        return NextResponse.json(
            { error: userMsg },
            { status: 500 }
        )
    }
}

