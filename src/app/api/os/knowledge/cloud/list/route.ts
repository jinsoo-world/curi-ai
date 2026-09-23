// GET /api/os/knowledge/cloud/list?mentorId=&provider=google_drive|notion
// → 그 서비스에서 고를 수 있는 폴더(드라이브)/문서(노션) 목록. 고르기 화면이 체크박스로 보여 준다.
//
// 🔒 첫 줄은 「내 팀 봇인가」 확인. 연결이 안 돼 있으면 이유를 사람 말로 돌려준다(화면은 /os/connect 로 안내).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBotOwned, BotNotMine } from '@/domains/os/knowledge'
import { cleanCloudProvider, listCloudItems, CloudNotConnected } from '@/domains/os/cloudsync'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const mentorId = req.nextUrl.searchParams.get('mentorId') || ''
    const provider = cleanCloudProvider(req.nextUrl.searchParams.get('provider'))
    if (!provider) return NextResponse.json({ error: '드라이브나 노션 중 하나를 골라 주세요' }, { status: 400 })

    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        const items = await listCloudItems(db, user.id, provider)
        return NextResponse.json({ items })
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        if (e instanceof CloudNotConnected) return NextResponse.json({ error: e.message, needConnect: true }, { status: 409 })
        const message = e instanceof Error ? e.message : '목록을 못 가져왔어요'
        console.error('[os/knowledge/cloud/list]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
