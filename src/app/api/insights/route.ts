// 인사이트 API — 생성 + 조회
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateAndSaveInsight, getInsightsBySession } from '@/domains/insight'

/** POST — 대화에서 인사이트 생성 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
        }

        const body = await request.json()
        const { sessionId, mentorId, mentorName, messages } = body

        if (!sessionId || !mentorId || !messages?.length) {
            return NextResponse.json({ error: '필수 정보가 부족해요' }, { status: 400 })
        }

        // 최소 4턴 이상의 대화가 필요
        if (messages.length < 4) {
            return NextResponse.json({
                error: '인사이트를 만들려면 대화를 좀 더 나눠보세요!',
            }, { status: 400 })
        }

        const insight = await generateAndSaveInsight({
            userId: user.id,
            sessionId,
            mentorId,
            mentorName,
            messages,
        })

        if (!insight) {
            return NextResponse.json({ error: '인사이트 생성에 실패했어요' }, { status: 500 })
        }

        return NextResponse.json({ insight })
    } catch (error) {
        console.error('[API/insights] POST error:', error)
        return NextResponse.json({ error: '서버 오류가 발생했어요' }, { status: 500 })
    }
}

/** GET — 세션별 인사이트 조회 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const sessionId = searchParams.get('sessionId')

        if (!sessionId) {
            return NextResponse.json({ error: 'sessionId 필요' }, { status: 400 })
        }

        const insights = await getInsightsBySession(sessionId)
        return NextResponse.json({ insights })
    } catch (error) {
        console.error('[API/insights] GET error:', error)
        return NextResponse.json({ error: '서버 오류가 발생했어요' }, { status: 500 })
    }
}
