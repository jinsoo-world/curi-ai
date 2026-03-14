import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { voiceSampleUrl } = await request.json()
        if (!voiceSampleUrl) {
            return NextResponse.json({ error: '음성 샘플 URL이 필요합니다.' }, { status: 400 })
        }

        const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY
        if (!ELEVENLABS_KEY) {
            return NextResponse.json({ error: 'ElevenLabs API 키 없음' }, { status: 500 })
        }

        console.log('[Clone Voice] ElevenLabs Add Voice 시작:', voiceSampleUrl)

        // 1. 음성 파일 다운로드
        const audioRes = await fetch(voiceSampleUrl)
        if (!audioRes.ok) {
            return NextResponse.json({ error: '음성 파일 다운로드 실패' }, { status: 500 })
        }
        const audioBuffer = await audioRes.arrayBuffer()
        const contentType = audioRes.headers.get('content-type') || 'audio/mpeg'

        // 2. ElevenLabs Add Voice
        const elForm = new FormData()
        elForm.append('name', `curi-clone-${Date.now()}`)
        elForm.append('description', 'Voice clone from Curi AI')
        const blob = new Blob([audioBuffer], { type: contentType })
        elForm.append('files', blob, `voice.${contentType.includes('wav') ? 'wav' : 'mp3'}`)

        const elRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
            method: 'POST',
            headers: { 'xi-api-key': ELEVENLABS_KEY },
            body: elForm,
        })

        const elData = await elRes.json()
        console.log('[Clone Voice] ElevenLabs 응답:', JSON.stringify({ status: elRes.status, voice_id: elData.voice_id }))

        if (elRes.ok && elData.voice_id) {
            console.log('[Clone Voice] ✅ 성공! voice_id:', elData.voice_id)
            return NextResponse.json({ voiceId: elData.voice_id })
        }

        const errMsg = elData.detail?.message || elData.detail || 'Voice clone 실패'
        console.error('[Clone Voice] ❌ 실패:', errMsg)
        return NextResponse.json({ error: errMsg }, { status: 500 })

    } catch (error: any) {
        console.error('[Clone Voice Error]', error)
        return NextResponse.json(
            { error: error?.message || '보이스 클론 중 오류' },
            { status: 500 }
        )
    }
}
