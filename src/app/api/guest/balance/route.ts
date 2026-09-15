// 손님이 남은 클로버가 얼마인지 — 화면 위 띠가 물어본다
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { 손님잔액, 주소꺼내기, GUEST_CLOVERS } from '@/lib/guest-clover'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return NextResponse.json({ 손님: false })

    const 표식 = req.nextUrl.searchParams.get('mark')
    const 남은값 = await 손님잔액(주소꺼내기(req.headers), 표식 && 표식.length > 8 ? 표식.slice(0, 64) : null)
    return NextResponse.json({ 손님: true, balance: 남은값, 전체: GUEST_CLOVERS })
}
