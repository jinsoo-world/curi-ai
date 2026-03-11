// /api/creator/monetization — 수익화 설정 조회/저장
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// GET: 수익화 설정 조회
export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const mentorId = req.nextUrl.searchParams.get('mentorId')
        if (!mentorId) {
            return NextResponse.json({ error: 'mentorId는 필수입니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        const { data, error } = await admin
            .from('mentor_monetization')
            .select('*')
            .eq('mentor_id', mentorId)
            .single()

        if (error && error.code !== 'PGRST116') {
            // PGRST116 = no rows found (정상 — 아직 설정 안 함)
            throw new Error(error.message)
        }

        // mentor handle도 함께 조회
        const { data: mentor } = await admin
            .from('mentors')
            .select('handle')
            .eq('id', mentorId)
            .single()

        return NextResponse.json({
            monetization: data || {
                is_premium: false,
                monthly_price: 9900,
                free_trial_chats: 3,
                free_trial_days: 7,
                toggle_count: 0,
            },
            handle: mentor?.handle || null,
        })
    } catch (error: unknown) {
        console.error('[Monetization GET] Error:', error)
        const message = error instanceof Error ? error.message : '조회 중 오류 발생'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}

// POST: 수익화 설정 저장 (upsert)
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json()
        const { mentorId, isPremium, monthlyPrice, freeTrialChats, freeTrialDays, handle } = body

        if (!mentorId) {
            return NextResponse.json({ error: 'mentorId는 필수입니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 기존 데이터 조회 (toggle_count 계산용)
        const { data: existing } = await admin
            .from('mentor_monetization')
            .select('is_premium, toggle_count')
            .eq('mentor_id', mentorId)
            .single()

        const wasToggled = existing && existing.is_premium !== isPremium
        const newToggleCount = (existing?.toggle_count || 0) + (wasToggled ? 1 : 0)

        // upsert monetization
        const { error: monetizationError } = await admin
            .from('mentor_monetization')
            .upsert({
                mentor_id: mentorId,
                is_premium: isPremium,
                monthly_price: monthlyPrice,
                free_trial_chats: freeTrialChats,
                free_trial_days: freeTrialDays,
                toggle_count: newToggleCount,
                premium_toggled_at: wasToggled ? new Date().toISOString() : (existing ? undefined : new Date().toISOString()),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'mentor_id',
            })

        if (monetizationError) throw new Error(monetizationError.message)

        // handle 업데이트 (별도)
        if (handle !== undefined) {
            // handle 중복 체크
            if (handle) {
                const { data: dup } = await admin
                    .from('mentors')
                    .select('id')
                    .eq('handle', handle)
                    .neq('id', mentorId)
                    .single()

                if (dup) {
                    return NextResponse.json({ error: '이미 사용 중인 URL입니다.' }, { status: 409 })
                }
            }

            const { error: handleError } = await admin
                .from('mentors')
                .update({ handle: handle || null })
                .eq('id', mentorId)

            if (handleError) throw new Error(handleError.message)
        }

        return NextResponse.json({
            success: true,
            toggleCount: newToggleCount,
        })
    } catch (error: unknown) {
        console.error('[Monetization POST] Error:', error)
        const message = error instanceof Error ? error.message : '저장 중 오류 발생'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
