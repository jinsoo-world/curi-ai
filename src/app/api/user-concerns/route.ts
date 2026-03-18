import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const { concern, matchedMentorId, matchedMentorName } = await request.json()

        if (!concern || typeof concern !== 'string') {
            return NextResponse.json({ error: '고민을 입력해주세요.' }, { status: 400 })
        }

        const admin = createAdminClient()

        // 고민 저장
        const { error } = await admin.from('user_concerns').insert({
            user_id: user.id,
            concern: concern.trim(),
            matched_mentor_id: matchedMentorId || null,
            matched_mentor_name: matchedMentorName || null,
            status: 'active',
        })

        if (error) {
            console.error('[User Concerns] Insert error:', error.message)
            // 테이블 없어도 에러만 로깅하고 200 반환 (UX 방해 X)
            return NextResponse.json({ saved: false })
        }

        return NextResponse.json({ saved: true })

    } catch (error: any) {
        console.error('[User Concerns Error]', error.message)
        return NextResponse.json({ saved: false })
    }
}

// 유저의 활성 고민 목록 조회
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ concerns: [] })
        }

        const admin = createAdminClient()
        const { data } = await admin.from('user_concerns')
            .select('id, concern, matched_mentor_name, status, created_at')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(5)

        return NextResponse.json({ concerns: data || [] })

    } catch {
        return NextResponse.json({ concerns: [] })
    }
}
