/**
 * 크레딧 API — 잔액 조회 + 트랜잭션 히스토리
 * GET /api/credits — 잔액 + 최근 거래내역
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

export async function GET() {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        // 잔액 조회
        const { data: userData } = await supabase
            .from('users')
            .select('credit_balance')
            .eq('id', user.id)
            .single()

        // 최근 트랜잭션 20개
        const { data: transactions } = await supabase
            .from('credit_transactions')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)

        return NextResponse.json({
            balance: userData?.credit_balance ?? 0,
            transactions: transactions ?? [],
        })
    } catch (error) {
        console.error('Credit API error:', error)
        return NextResponse.json({ error: '서버 오류' }, { status: 500 })
    }
}
