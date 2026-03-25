// /api/creator/mentor/transfer — AI 멘토 소유권 이전 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json()
        const { mentorId, targetEmail } = body

        if (!mentorId || !targetEmail) {
            return NextResponse.json({ error: '멘토 ID와 이전받을 이메일은 필수입니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 1. 관리자만 소유권 이전 가능
        if (user.email !== 'jin@mission-driven.kr') {
            return NextResponse.json({ error: '관리자만 소유권을 이전할 수 있습니다.' }, { status: 403 })
        }

        // 2. 해당 멘토 조회
        const { data: mentor, error: mentorError } = await admin
            .from('mentors')
            .select('id, name, creator_id')
            .eq('id', mentorId)
            .single()

        if (mentorError || !mentor) {
            return NextResponse.json({ error: '멘토를 찾을 수 없습니다.' }, { status: 404 })
        }

        // 4. 대상 사용자 조회 (이메일로)
        const { data: targetUser, error: userError } = await admin
            .from('users')
            .select('id, display_name, email')
            .eq('email', targetEmail)
            .maybeSingle()

        if (userError || !targetUser) {
            return NextResponse.json({ error: '해당 이메일의 사용자를 찾을 수 없습니다.' }, { status: 404 })
        }

        // 5. 대상 사용자의 크리에이터 프로필 조회 (없으면 자동 생성)
        let { data: targetCreator } = await admin
            .from('creator_profiles')
            .select('id')
            .eq('user_id', targetUser.id)
            .maybeSingle()

        if (!targetCreator) {
            const { data: newCreator, error: createError } = await admin
                .from('creator_profiles')
                .insert({
                    user_id: targetUser.id,
                    display_name: targetUser.display_name || targetUser.email?.split('@')[0] || '크리에이터',
                })
                .select('id')
                .single()

            if (createError || !newCreator) {
                return NextResponse.json({ error: '대상 사용자의 크리에이터 프로필 생성에 실패했습니다.' }, { status: 500 })
            }

            targetCreator = newCreator
        }

        // 6. 멘토의 creator_id를 새 소유자로 변경
        const { error: updateError } = await admin
            .from('mentors')
            .update({
                creator_id: targetCreator.id,
                updated_at: new Date().toISOString(),
            })
            .eq('id', mentorId)

        if (updateError) {
            console.error('[Transfer] Update error:', updateError.message)
            return NextResponse.json({ error: '소유권 이전에 실패했습니다.' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: `${mentor.name}의 소유권이 ${targetUser.display_name || targetEmail}에게 이전되었습니다.`,
        })
    } catch (error: unknown) {
        console.error('[Transfer API] Error:', error)
        const message = error instanceof Error ? error.message : '소유권 이전 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
