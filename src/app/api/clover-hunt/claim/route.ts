// /api/clover-hunt/claim — 네잎클로버 발견 시 클로버 적립
// 🎰 가변 보상: 7~15 랜덤 (평균 10), 황금 클로버 5% 확률 시 50~100 잭팟
// 🏆 올클리어 보너스: 일일 한도 달성 시 추가 +20
// 하루 3개 기본, 10분(600초) 이상 체류 시 5개까지

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createBrowserClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_DAILY_LIMIT = 3
const EXTENDED_DAILY_LIMIT = 5
const EXTENDED_THRESHOLD_SECONDS = 600 // 10분
const GOLDEN_CHANCE = 0.05 // 5% 황금 클로버
const ALL_CLEAR_BONUS = 20

/** 7~15 사이 랜덤 보상 (평균 ≈ 10) */
function getRandomReward(): number {
    return Math.floor(Math.random() * 9) + 7 // 7, 8, 9, 10, 11, 12, 13, 14, 15
}

/** 황금 클로버 잭팟: 50 or 100 */
function getGoldenReward(): number {
    return Math.random() < 0.5 ? 50 : 100
}

export async function POST(request: Request) {
    try {
        const supabase = await createBrowserClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // body에서 체류시간 받기
        let sessionDuration = 0
        try {
            const body = await request.json()
            sessionDuration = body.sessionDuration || 0
        } catch {
            // body 파싱 실패해도 진행
        }

        // 오늘 날짜 기준
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        // 오늘 획득한 클로버 수 조회
        const { data: todayClovers } = await supabaseAdmin
            .from('credits')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'clover_hunt')
            .gte('created_at', today.toISOString())

        const todayCount = todayClovers?.length || 0

        // 일일 한도 결정 (10분 이상 체류 → 5개)
        const dailyLimit = sessionDuration >= EXTENDED_THRESHOLD_SECONDS
            ? EXTENDED_DAILY_LIMIT
            : BASE_DAILY_LIMIT

        // 한도 체크
        if (todayCount >= dailyLimit) {
            return NextResponse.json({
                ok: false,
                error: todayCount >= EXTENDED_DAILY_LIMIT
                    ? '오늘의 클로버를 모두 찾았어요! 내일 다시 도전하세요 🍀'
                    : '기본 한도에 도달했어요! 10분 이상 머물면 2개 더 찾을 수 있어요 ⏰',
                todayCount,
                dailyLimit,
            })
        }

        // 🎰 보상 결정
        const isGolden = Math.random() < GOLDEN_CHANCE
        const baseReward = isGolden ? getGoldenReward() : getRandomReward()
        const newCount = todayCount + 1
        const isAllClear = newCount >= dailyLimit

        // 총 보상 = 기본 + 올클리어 보너스
        const totalReward = baseReward + (isAllClear ? ALL_CLEAR_BONUS : 0)

        // 적립
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

        // 최신 잔액 계산
        const { data: balanceData } = await supabaseAdmin
            .from('credits')
            .select('amount')
            .eq('user_id', user.id)
        const newBalance = (balanceData || []).reduce(
            (s: number, r: { amount: number }) => s + r.amount, 0
        )

        // users.clovers 동기화
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

        return NextResponse.json({
            ok: true,
            todayCount: todayClovers?.length || 0,
            baseDailyLimit: BASE_DAILY_LIMIT,
            extendedDailyLimit: EXTENDED_DAILY_LIMIT,
        })
    } catch (err: unknown) {
        console.error('Clover hunt status error:', err)
        return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 })
    }
}
