// /api/auth/me — 현재 로그인 사용자 확인
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        return NextResponse.json({ user: user || null })
    } catch {
        return NextResponse.json({ user: null })
    }
}
