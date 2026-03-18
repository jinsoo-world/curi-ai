// /api/user/link-visitor — 비회원→회원 전환 시 visitor_id 연결
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인 필요' }, { status: 401 })
        }

        const { visitorId } = await req.json()

        if (!visitorId || typeof visitorId !== 'string') {
            return NextResponse.json({ error: 'visitorId 필요' }, { status: 400 })
        }

        const db = createAdminClient()

        // 이미 visitor_id가 있으면 스킵
        const { data: existing } = await db
            .from('users')
            .select('visitor_id')
            .eq('id', user.id)
            .single()

        if (existing?.visitor_id) {
            return NextResponse.json({ ok: true, already: true })
        }

        // visitor_id 저장
        const { error } = await db
            .from('users')
            .update({
                visitor_id: visitorId,
                converted_at: new Date().toISOString(),
            })
            .eq('id', user.id)

        if (error) {
            console.error('[Link Visitor] Error:', error.message)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        console.log(`[Link Visitor] ✅ User ${user.id} linked to visitor ${visitorId}`)
        return NextResponse.json({ ok: true })
    } catch (e: any) {
        console.error('[Link Visitor] Error:', e)
        return NextResponse.json({ error: e?.message }, { status: 500 })
    }
}
