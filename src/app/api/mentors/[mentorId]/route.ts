import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMentorById } from '@/domains/mentor'

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ mentorId: string }> }
) {
    const { mentorId } = await params

    try {
        const supabase = await createClient()

        // domains/mentor — ID → slug → 폴백 순서로 조회
        const mentor = await getMentorById(supabase, mentorId)

        if (!mentor) {
            return NextResponse.json(
                { error: '멘토를 찾을 수 없습니다' },
                { status: 404 }
            )
        }

        return NextResponse.json({ mentor })
    } catch (e) {
        console.error('[Mentors API] GET error:', e)
        return NextResponse.json(
            { error: '서버 오류' },
            { status: 500 }
        )
    }
}

// 🔒 음성 삭제 시 voice_id/voice_sample_url 초기화 + ElevenLabs Voice 삭제
const ALLOWED_FIELDS = ['voice_id', 'voice_sample_url', 'voice_test_url']

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ mentorId: string }> }
) {
    const { mentorId } = await params
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인 필요' }, { status: 401 })

        const body = await request.json()
        const updates: Record<string, string | null> = {}
        for (const key of ALLOWED_FIELDS) {
            if (key in body) updates[key] = body[key]
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })
        }

        // 🗑️ voice_id를 null로 바꾸는 경우 → ElevenLabs에서도 삭제
        if ('voice_id' in updates && updates.voice_id === null) {
            const { data: mentor } = await supabase
                .from('mentors')
                .select('voice_id')
                .eq('id', mentorId)
                .eq('creator_id', user.id)
                .single()

            if (mentor?.voice_id) {
                const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY
                if (ELEVENLABS_KEY) {
                    try {
                        const delRes = await fetch(`https://api.elevenlabs.io/v1/voices/${mentor.voice_id}`, {
                            method: 'DELETE',
                            headers: { 'xi-api-key': ELEVENLABS_KEY },
                        })
                        console.log(`[Mentor PATCH] 🗑️ ElevenLabs Voice 삭제: ${mentor.voice_id} → ${delRes.status}`)
                    } catch (e) {
                        console.error('[Mentor PATCH] ElevenLabs 삭제 실패 (무시):', e)
                    }
                }
            }
        }

        const { error } = await supabase
            .from('mentors')
            .update(updates)
            .eq('id', mentorId)
            .eq('creator_id', user.id)

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[Mentors API] PATCH error:', e)
        return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 })
    }
}
