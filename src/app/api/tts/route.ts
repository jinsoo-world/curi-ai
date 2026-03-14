import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
    try {
        // 인증 확인
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { text, voiceId: requestVoiceId } = await request.json()

        if (!text || typeof text !== 'string') {
            return NextResponse.json({ error: '텍스트가 필요합니다.' }, { status: 400 })
        }

        const trimmedText = text.slice(0, 500)

        const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY
        if (!ELEVENLABS_KEY) {
            return NextResponse.json({ error: 'ElevenLabs API 키가 설정되지 않았습니다.' }, { status: 500 })
        }

        // voice_id: 요청에서 직접 또는 기본 다국어 음성
        const voiceId = requestVoiceId || 'pFZP5JQG7iQjIQuC4Bku'  // ElevenLabs 기본 여성 한국어 음성 (Lily)

        console.log('[TTS] ElevenLabs 요청:', { voiceId, textLen: trimmedText.length })

        // ElevenLabs TTS Streaming API
        const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text: trimmedText,
                model_id: 'eleven_turbo_v2_5',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true,
                },
            }),
        })

        if (!ttsRes.ok) {
            const errBody = await ttsRes.text()
            console.error('[TTS] ElevenLabs 실패:', ttsRes.status, errBody)

            if (ttsRes.status === 429) {
                return NextResponse.json({ error: '요청이 너무 많습니다.' }, { status: 429 })
            }
            if (ttsRes.status === 401) {
                return NextResponse.json({ error: 'API 인증 오류입니다.' }, { status: 500 })
            }
            return NextResponse.json({ error: '음성 생성에 실패했습니다.' }, { status: 500 })
        }

        // 오디오 스트림을 ArrayBuffer로 변환 → Base64 data URL 반환
        const audioBuffer = await ttsRes.arrayBuffer()
        const base64 = Buffer.from(audioBuffer).toString('base64')
        const audioUrl = `data:audio/mpeg;base64,${base64}`

        console.log('[TTS] ✅ ElevenLabs 성공:', { voiceId, audioSize: audioBuffer.byteLength })

        return NextResponse.json({ audioUrl })

    } catch (error: any) {
        console.error('[TTS API Error]', error)
        return NextResponse.json(
            { error: '음성 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
