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

// 🔒 음성 삭제 시 voice_id/voice_sample_url 초기화용
const ALLOWED_FIELDS = ['voice_id', 'voice_sample_url']

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
        // 허용된 필드만 업데이트
        const updates: Record<string, string | null> = {}
        for (const key of ALLOWED_FIELDS) {
            if (key in body) updates[key] = body[key]
        }
        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: '업데이트할 필드 없음' }, { status: 400 })
        }

        const { error } = await supabase
            .from('mentors')
            .update(updates)
            .eq('id', mentorId)
            .eq('creator_id', user.id) // 소유자만 수정 가능

        if (error) throw error
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[Mentors API] PATCH error:', e)
        return NextResponse.json({ error: e?.message || '서버 오류' }, { status: 500 })
    }
}
