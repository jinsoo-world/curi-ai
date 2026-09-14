// 비회원이 만든 사진을 로그인 뒤 찾아간다 — 전수조사 2번
//
// 그동안은 흐린 사진을 보고 로그인하면 방금 만든 것이 통째로 날아갔다.
// 서버는 선명한 원본을 이미 보관함에 넣어두고 「찾아가는 표」만 줬으므로,
// 로그인한 사람이 그 표를 들고 오면 소유권을 넘긴다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

    const { claimToken } = await req.json()
    if (typeof claimToken !== 'string' || claimToken.length < 10) {
        return NextResponse.json({ error: '찾을 사진이 없어요.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: row } = await admin
        .from('tool_photos')
        .select('id, path, expires_at, user_id')
        .eq('claim_token', claimToken)
        .maybeSingle()

    if (!row) return NextResponse.json({ error: '사진을 찾지 못했어요. 48시간이 지났을 수 있어요.' }, { status: 404 })
    if (row.user_id && row.user_id !== user.id) {
        return NextResponse.json({ error: '다른 분이 이미 가져간 사진이에요.' }, { status: 409 })
    }
    if (new Date(row.expires_at) < new Date()) {
        return NextResponse.json({ error: '48시간이 지나 사진이 지워졌어요.' }, { status: 410 })
    }

    await admin.from('tool_photos').update({ user_id: user.id, claim_token: null }).eq('id', row.id)
    const { data: pub } = admin.storage.from('tool-photos').getPublicUrl(row.path)
    return NextResponse.json({ success: true, url: pub.publicUrl })
}
