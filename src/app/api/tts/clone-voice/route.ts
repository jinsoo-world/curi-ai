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

        const { voiceSampleUrl } = await request.json()
        if (!voiceSampleUrl) {
            return NextResponse.json({ error: '음성 샘플 URL이 필요합니다.' }, { status: 400 })
        }

        const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN
        if (!REPLICATE_TOKEN) {
            return NextResponse.json({ error: 'Replicate API 토큰 없음' }, { status: 500 })
        }

        console.log('[Clone Voice] 시작:', voiceSampleUrl)

        const cloneRes = await fetch('https://api.replicate.com/v1/models/minimax/voice-cloning/predictions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${REPLICATE_TOKEN}`,
                'Content-Type': 'application/json',
                'Prefer': 'wait',
            },
            body: JSON.stringify({
                input: { voice_file: voiceSampleUrl },
            }),
        })

        const cloneData = await cloneRes.json()
        console.log('[Clone Voice] 응답:', JSON.stringify({
            status: cloneData.status,
            output: cloneData.output,
            error: cloneData.error,
        }))

        if (cloneData.status === 'succeeded' && cloneData.output) {
            // output 구조: { voice_id: "...", model: "...", preview: "..." } 또는 string
            let voiceId: string | null = null

            if (typeof cloneData.output === 'string') {
                voiceId = cloneData.output
            } else if (typeof cloneData.output === 'object') {
                voiceId = cloneData.output.voice_id || cloneData.output.id || null
            }

            if (voiceId) {
                console.log('[Clone Voice] ✅ 성공! voice_id:', voiceId)
                return NextResponse.json({ voiceId, preview: cloneData.output?.preview || null })
            }
        }

        // 실패
        const errMsg = cloneData.error || `Clone 실패 (status: ${cloneData.status})`
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
