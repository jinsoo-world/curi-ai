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
