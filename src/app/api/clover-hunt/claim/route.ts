// /api/clover-hunt/claim — 네잎클로버 발견 시 클로버 적립
// 🎰 가변 보상: 7~15 랜덤 (평균 10), 황금 클로버 5% 확률 시 50~100 잭팟
// 🏆 올클리어 보너스: 일일 한도 달성 시 추가 +20
// 첫 가입일 5개, 이후 3개 기본, 10분(600초) 이상 체류 시 5개까지

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FIRST_DAY_LIMIT = 5         // 첫 가입일
const BASE_DAILY_LIMIT = 3        // 이후
const EXTENDED_DAILY_LIMIT = 5    // 10분 이상 체류 시
const EXTENDED_THRESHOLD_SECONDS = 600
const GOLDEN_CHANCE = 0.05
const ALL_CLEAR_BONUS = 20

/** 7~15 사이 랜덤 보상 (평균 ≈ 10) */
function getRandomReward(): number {
    return Math.floor(Math.random() * 9) + 7
}

/** 황금 클로버 잭팟: 50 or 100 */
function getGoldenReward(): number {
    return Math.random() < 0.5 ? 50 : 100
}

/** 오늘이 가입일인지 체크 */
function isFirstDay(createdAt: string): boolean {
    const signupDate = new Date(createdAt)
    const today = new Date()
    return signupDate.toDateString() === today.toDateString()
}

export async function POST(request: Request) {
    try {
        const supabase = await createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        let sessionDuration = 0
        try {
            const body = await request.json()
            sessionDuration = body.sessionDuration || 0
        } catch { /* body 파싱 실패해도 진행 */ }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const { data: todayClovers } = await supabaseAdmin
            .from('credits')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'clover_hunt')
            .gte('created_at', today.toISOString())

        const todayCount = todayClovers?.length || 0

        // 일일 한도: 첫 가입일 5개, 이후 3개 (10분 체류 시 5개로 확장)
        const firstDay = isFirstDay(user.created_at)
        let dailyLimit: number
        if (firstDay) {
            dailyLimit = FIRST_DAY_LIMIT
        } else if (sessionDuration >= EXTENDED_THRESHOLD_SECONDS) {
            dailyLimit = EXTENDED_DAILY_LIMIT
        } else {
            dailyLimit = BASE_DAILY_LIMIT
        }

        if (todayCount >= dailyLimit) {
            return NextResponse.json({
                ok: false,
                error: firstDay
                    ? '오늘의 웰컴 클로버를 모두 찾았어요! 🎊'
                    : todayCount >= EXTENDED_DAILY_LIMIT
                        ? '오늘의 클로버를 모두 찾았어요! 내일 다시 도전하세요 🍀'
                        : '기본 한도에 도달했어요! 10분 이상 머물면 2개 더 찾을 수 있어요 ⏰',
                todayCount,
                dailyLimit,
            })
        }

        const isGolden = Math.random() < GOLDEN_CHANCE
        const baseReward = isGolden ? getGoldenReward() : getRandomReward()
        const newCount = todayCount + 1
        const isAllClear = newCount >= dailyLimit
        const totalReward = baseReward + (isAllClear ? ALL_CLEAR_BONUS : 0)

        const description = isGolden
            ? `✨ 황금 네잎클로버 발견! 잭팟! (${newCount}/${dailyLimit})`
            : isAllClear
                ? `🍀 네잎클로버 발견! 올클리어 보너스! (${newCount}/${dailyLimit})`
                : `🍀 네잎클로버 발견! (${newCount}/${dailyLimit})`

        await supabaseAdmin.from('credits').insert({
            user_id: user.id,
            amount: totalReward,
            type: 'clover_hunt',
            description,
        })

        const { data: balanceData } = await supabaseAdmin
            .from('credits')
            .select('amount')
            .eq('user_id', user.id)
        const newBalance = (balanceData || []).reduce(
            (s: number, r: { amount: number }) => s + r.amount, 0
        )

        await supabaseAdmin.from('users').update({ clovers: newBalance }).eq('id', user.id)

        return NextResponse.json({
            ok: true,
            earned: baseReward,
            bonusEarned: isAllClear ? ALL_CLEAR_BONUS : 0,
            totalEarned: totalReward,
            isGolden,
            isAllClear,
            todayCount: newCount,
            dailyLimit,
            clovers: newBalance,
            firstDay,
        })
    } catch (err: unknown) {
        console.error('Clover hunt claim error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}

// GET — 오늘의 클로버 현황 조회
export async function GET() {
    try {
        const supabase = await createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const { data: todayClovers } = await supabaseAdmin
            .from('credits')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'clover_hunt')
            .gte('created_at', today.toISOString())

        const firstDay = isFirstDay(user.created_at)

        return NextResponse.json({
            ok: true,
            todayCount: todayClovers?.length || 0,
            baseDailyLimit: firstDay ? FIRST_DAY_LIMIT : BASE_DAILY_LIMIT,
            extendedDailyLimit: EXTENDED_DAILY_LIMIT,
            firstDay,
        })
    } catch (err: unknown) {
        console.error('Clover hunt status error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}
